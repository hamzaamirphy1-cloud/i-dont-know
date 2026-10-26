import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { query, transaction } from "./db";
import { applicationOrigin } from "./hosted";
import { HttpError, type User } from "./auth";

// This narrow SDK boundary lets integration tests exercise real PostgreSQL writes
// without sending payments to Stripe. API callers cannot provide a gateway.
type SessionReference = Pick<
  Stripe.Checkout.Session,
  | "id"
  | "metadata"
  | "client_reference_id"
  | "amount_total"
  | "currency"
  | "mode"
>;
export type CheckoutSessionsGateway = {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
  list(params: Stripe.Checkout.SessionListParams): Promise<{
    data: SessionReference[];
  }>;
};

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_"))
    throw new HttpError(
      503,
      "Stripe test checkout is not connected. Configure a Stripe test secret key.",
    );
  return new Stripe(key);
}
export function paymentConnected() {
  try {
    return !!(
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      applicationOrigin()
    );
  } catch {
    return false;
  }
}
export async function checkout(
  user: User,
  productId: string,
  gateway?: CheckoutSessionsGateway,
) {
  if (user.role !== "buyer" || user.disabled)
    throw new HttpError(
      403,
      "An active buyer account is required to purchase.",
    );
  if (!paymentConnected())
    throw new HttpError(
      503,
      "Payments are not connected. Configure Stripe test keys and the webhook endpoint.",
    );
  const { rows } = await query(
    "SELECT * FROM products WHERE id=$1 AND status='approved'",
    [productId],
  );
  const p = rows[0];
  if (!p) throw new HttpError(404, "Project is not available.");
  if (!p.artifact_key || !p.artifact_sha256)
    throw new HttpError(
      409,
      "Source download is not connected for this project. The builder must attach an archive before checkout.",
    );
  if (
    (
      await query(
        "SELECT id FROM orders WHERE buyer_id=$1 AND product_id=$2 AND status='paid'",
        [user.id, productId],
      )
    ).rowCount
  )
    throw new HttpError(
      409,
      "You already own this project. Download it from your workspace.",
    );
  const id = randomUUID();
  await query(
    "INSERT INTO orders(id,buyer_id,product_id,total_cents,license_snapshot,artifact_key,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      user.id,
      productId,
      p.price_cents,
      p.license,
      p.artifact_key,
      p.artifact_sha256,
    ],
  );
  try {
    const session = await (gateway ?? stripeClient().checkout.sessions).create(
      {
        mode: "payment",
        client_reference_id: id,
        customer_email: user.email,
        metadata: { order_id: id },
        payment_intent_data: { metadata: { order_id: id } },
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: p.price_cents,
              product_data: { name: p.name },
            },
            quantity: 1,
          },
        ],
        success_url: `${applicationOrigin()}/?checkout=returned`,
        cancel_url: `${applicationOrigin()}/?checkout=cancelled`,
      },
      { idempotencyKey: `checkout-${id}` },
    );
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(session.url ?? "");
    } catch {
      throw new HttpError(502, "Stripe did not return a valid checkout URL.");
    }
    if (
      !session.id.startsWith("cs_test_") ||
      checkoutUrl.protocol !== "https:" ||
      checkoutUrl.hostname !== "checkout.stripe.com"
    )
      throw new HttpError(
        502,
        "Stripe did not return a supported test checkout.",
      );
    await query("UPDATE orders SET stripe_session_id=$1 WHERE id=$2", [
      session.id,
      id,
    ]);
    return { url: checkoutUrl.href };
  } catch (e) {
    // Do not overwrite a payment/refund webhook that arrived while the checkout
    // request was in flight. Failed local attempts must never grant access.
    await query(
      "UPDATE orders SET status='failed' WHERE id=$1 AND status='pending'",
      [id],
    );
    throw e;
  }
}
export async function processStripeEvent(
  event: Stripe.Event,
  gateway?: CheckoutSessionsGateway,
) {
  if (event.livemode)
    throw new HttpError(400, "Only Stripe test events are supported.");
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "charge.refunded",
    ].includes(event.type)
  )
    return;
  await transaction(async (c) => {
    const inserted = await c.query(
      "INSERT INTO stripe_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
      [event.id, event.type],
    );
    if (!inserted.rowCount) return;
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (charge.refunded && charge.payment_intent) {
        const sessions = await (
          gateway ?? stripeClient().checkout.sessions
        ).list({
          payment_intent:
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent.id,
          limit: 1,
        });
        const session = sessions.data[0];
        // Ignore refunds for unrelated products sharing the Stripe account.
        if (!session?.metadata?.order_id) return;
        const { rows } = await c.query(
          "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
          [session.metadata.order_id],
        );
        const order = rows[0];
        if (
          !order ||
          (order.stripe_session_id && order.stripe_session_id !== session.id) ||
          session.client_reference_id !== order.id ||
          session.amount_total !== order.total_cents ||
          session.currency !== order.currency ||
          session.mode !== "payment"
        )
          throw new HttpError(400, "Refund checkout does not match the order.");
        // A full refund can precede completion, or even the local session bind.
        // Preserve that terminal state when later completion events arrive.
        await c.query(
          "UPDATE orders SET status='refunded',stripe_session_id=COALESCE(stripe_session_id,$1) WHERE id=$2",
          [session.id, order.id],
        );
      }
      return;
    }
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.metadata?.order_id)
      throw new HttpError(400, "Missing order reference.");
    const { rows } = await c.query(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [session.metadata.order_id],
    );
    const order = rows[0];
    if (
      !order ||
      session.id !== order.stripe_session_id ||
      session.client_reference_id !== order.id ||
      session.amount_total !== order.total_cents ||
      session.currency !== order.currency ||
      session.mode !== "payment"
    )
      throw new HttpError(400, "Checkout does not match the order.");
    if (event.type === "checkout.session.async_payment_failed") {
      await c.query(
        "UPDATE orders SET status='failed' WHERE id=$1 AND status='pending'",
        [order.id],
      );
      return;
    }
    if (session.payment_status !== "paid") return;
    if (order.status === "paid" || order.status === "refunded") return;
    // Serialize purchases for this buyer to enforce a single licensed purchase.
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      order.buyer_id,
    ]);
    const owned = await c.query(
      "SELECT id FROM orders WHERE buyer_id=$1 AND product_id=$2 AND status='paid'",
      [order.buyer_id, order.product_id],
    );
    if (owned.rowCount)
      throw new HttpError(
        409,
        "Duplicate payment requires manual refund review.",
      );
    await c.query("UPDATE orders SET status='paid',paid_at=now() WHERE id=$1", [
      order.id,
    ]);
  });
}
