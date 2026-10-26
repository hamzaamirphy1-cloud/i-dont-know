import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type Stripe from "stripe";
import { pool, query } from "../lib/db";
import type { User } from "../lib/auth";
import {
  checkout,
  processStripeEvent,
  type CheckoutSessionsGateway,
} from "../lib/payments";

const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test")) {
  throw new Error(
    "Payment tests require a dedicated TEST_DATABASE_URL ending in _test.",
  );
}
// A private schema keeps these fixtures isolated even when test files run in
// separate workers concurrently against the same dedicated test database.
const schema = "payments_" + randomUUID().replaceAll("-", "");
const url = new URL(database);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.href;
process.env.APP_URL = "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_local_gateway_fixture_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET =
  "whsec_local_gateway_fixture_not_a_real_secret";

const buyer: User = {
  id: randomUUID(),
  email: "checkout-buyer@test.local",
  name: "Checkout Buyer",
  role: "buyer",
  disabled: false,
};
const builder: User = {
  id: randomUUID(),
  email: "checkout-builder@test.local",
  name: "Checkout Builder",
  role: "builder",
  disabled: false,
};
before(async () => {
  await query(`CREATE SCHEMA ${schema}`);
  await query(
    await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8"),
  );
  for (const user of [buyer, builder]) {
    await query(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [user.id, user.email, user.name, "unused-test-hash", user.role],
    );
  }
});
after(async () => {
  await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool().end();
});
async function product(options: { status?: string; source?: boolean } = {}) {
  const id = randomUUID();
  const key = randomUUID() + ".zip";
  const hash = "a".repeat(64);
  await query(
    `INSERT INTO products(id,seller_id,name,description,category,technology,features,price_cents,repository,license,status,artifact_key,artifact_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      builder.id,
      "Checkout Project",
      "A fixture for checkout integration tests.",
      "Productivity",
      ["Next.js"],
      ["Useful workflows"],
      14900,
      "https://github.com/example/checkout",
      "One business installation. No redistribution.",
      options.status ?? "approved",
      options.source === false ? null : key,
      options.source === false ? null : hash,
    ],
  );
  return { id, key, hash };
}
function stub(options: { error?: Error; url?: string | null } = {}) {
  const calls: Array<{
    params: Stripe.Checkout.SessionCreateParams;
    options?: Stripe.RequestOptions;
  }> = [];
  const sessionId = "cs_test_" + randomUUID();
  const sessionUrl =
    options.url === undefined
      ? `https://checkout.stripe.com/c/pay/${sessionId}`
      : options.url;
  let refundSessions: Awaited<
    ReturnType<CheckoutSessionsGateway["list"]>
  >["data"] = [];
  const lists: Stripe.Checkout.SessionListParams[] = [];
  const client: CheckoutSessionsGateway = {
    async create(params, requestOptions) {
      calls.push({ params, options: requestOptions });
      if (options.error) throw options.error;
      return { id: sessionId, url: sessionUrl };
    },
    async list(params) {
      lists.push(params);
      return { data: refundSessions };
    },
  };
  return {
    client,
    calls,
    lists,
    sessionId,
    sessionUrl,
    setRefundSessions: (value: typeof refundSessions) => {
      refundSessions = value;
    },
  };
}
async function orderForSession(sessionId: string) {
  return (
    await query("SELECT * FROM orders WHERE stripe_session_id=$1", [sessionId])
  ).rows[0];
}
function completed(
  id: string,
  order: Record<string, unknown>,
  sessionId: string,
) {
  return {
    id,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: sessionId,
        client_reference_id: order.id,
        metadata: { order_id: order.id },
        mode: "payment",
        amount_total: order.total_cents,
        currency: "usd",
        payment_status: "paid",
      },
    },
  } as unknown as Stripe.Event;
}
function refunded(id: string, fully = true) {
  return {
    id,
    type: "charge.refunded",
    livemode: false,
    data: {
      object: {
        id: "ch_test_refund",
        refunded: fully,
        payment_intent: "pi_test_checkout",
      },
    },
  } as unknown as Stripe.Event;
}

test("Stripe checkout boundary and persistence", async (t) => {
  await t.test(
    "session creation uses only database price and snapshots source/license without granting access",
    async () => {
      const p = await product(),
        s = stub();
      const result = await checkout(buyer, p.id, s.client);
      assert.equal(result.url, s.sessionUrl);
      assert.equal(s.calls.length, 1);
      const params = s.calls[0].params;
      assert.equal(params.mode, "payment");
      assert.equal(params.customer_email, buyer.email);
      assert.equal(params.line_items?.[0].price_data?.unit_amount, 14900);
      assert.equal(params.line_items?.[0].price_data?.currency, "usd");
      assert.equal(params.line_items?.[0].quantity, 1);
      assert.equal(
        params.success_url,
        "http://localhost:3000/?checkout=returned",
      );
      const order = await orderForSession(s.sessionId);
      assert.equal(order.status, "pending");
      assert.equal(order.total_cents, 14900);
      assert.equal(order.artifact_key, p.key);
      assert.equal(order.artifact_sha256, p.hash);
      assert.equal(
        order.license_snapshot,
        "One business installation. No redistribution.",
      );
      assert.equal(params.client_reference_id, order.id);
      assert.equal(params.metadata?.order_id, order.id);
      assert.equal(params.payment_intent_data?.metadata?.order_id, order.id);
      assert.equal(s.calls[0].options?.idempotencyKey, `checkout-${order.id}`);
    },
  );
  await t.test(
    "unpublished projects, missing source and inactive/non-buyer accounts never create sessions",
    async () => {
      const pending = await product({ status: "pending" }),
        missing = await product({ source: false }),
        approved = await product(),
        s = stub();
      await assert.rejects(
        () => checkout(buyer, pending.id, s.client),
        /not available/,
      );
      await assert.rejects(
        () => checkout(buyer, missing.id, s.client),
        /not connected/,
      );
      await assert.rejects(
        () => checkout(builder, approved.id, s.client),
        /active buyer/,
      );
      await assert.rejects(
        () => checkout({ ...buyer, disabled: true }, approved.id, s.client),
        /active buyer/,
      );
      assert.equal(s.calls.length, 0);
    },
  );
  await t.test(
    "provider failures are persisted as failed attempts and grant no purchase",
    async () => {
      const p = await product(),
        s = stub({ error: new Error("Simulated provider outage") });
      await assert.rejects(
        () => checkout(buyer, p.id, s.client),
        /provider outage/,
      );
      const order = (
        await query("SELECT * FROM orders WHERE product_id=$1", [p.id])
      ).rows[0];
      assert.equal(order.status, "failed");
      assert.equal(order.stripe_session_id, null);
    },
  );
  await t.test(
    "null or unexpected hosted checkout URLs fail closed",
    async () => {
      for (const checkoutUrl of [
        null,
        "https://evil.example/pay",
        "http://checkout.stripe.com/pay",
      ]) {
        const p = await product(),
          s = stub({ url: checkoutUrl });
        await assert.rejects(
          () => checkout(buyer, p.id, s.client),
          /valid checkout|supported test/,
        );
        const order = (
          await query("SELECT * FROM orders WHERE product_id=$1", [p.id])
        ).rows[0];
        assert.equal(order.status, "failed");
        assert.equal(order.stripe_session_id, null);
      }
    },
  );
  await t.test(
    "verified completion is idempotent and a buyer cannot purchase an owned project again",
    async () => {
      const p = await product(),
        s = stub();
      await checkout(buyer, p.id, s.client);
      const order = await orderForSession(s.sessionId),
        event = completed("evt_" + randomUUID(), order, s.sessionId);
      await processStripeEvent(event, s.client);
      await processStripeEvent(event, s.client);
      assert.equal((await orderForSession(s.sessionId)).status, "paid");
      assert.equal(
        (await query("SELECT id FROM stripe_events WHERE id=$1", [event.id]))
          .rowCount,
        1,
      );
      await assert.rejects(
        () => checkout(buyer, p.id, s.client),
        /already own/,
      );
      assert.equal(s.calls.length, 1);
    },
  );
  await t.test(
    "full refund before completion revokes the order and cannot be undone by a late completion",
    async () => {
      const p = await product(),
        s = stub();
      await checkout(buyer, p.id, s.client);
      const order = await orderForSession(s.sessionId);
      s.setRefundSessions([
        {
          id: s.sessionId,
          metadata: { order_id: order.id },
          client_reference_id: order.id,
          amount_total: order.total_cents,
          currency: "usd",
          mode: "payment",
        },
      ]);
      const event = refunded("evt_" + randomUUID());
      await processStripeEvent(event, s.client);
      await processStripeEvent(event, s.client);
      assert.equal((await orderForSession(s.sessionId)).status, "refunded");
      await processStripeEvent(
        completed("evt_" + randomUUID(), order, s.sessionId),
        s.client,
      );
      assert.equal((await orderForSession(s.sessionId)).status, "refunded");
      assert.deepEqual(s.lists, [
        { payment_intent: "pi_test_checkout", limit: 1 },
      ]);
    },
  );
  await t.test(
    "a refund racing the local session bind is preserved",
    async () => {
      const p = await product(),
        s = stub();
      await checkout(buyer, p.id, s.client);
      const order = await orderForSession(s.sessionId);
      await query("UPDATE orders SET stripe_session_id=NULL WHERE id=$1", [
        order.id,
      ]);
      s.setRefundSessions([
        {
          id: s.sessionId,
          metadata: { order_id: order.id },
          client_reference_id: order.id,
          amount_total: order.total_cents,
          currency: "usd",
          mode: "payment",
        },
      ]);
      await processStripeEvent(refunded("evt_" + randomUUID()), s.client);
      const result = await orderForSession(s.sessionId);
      assert.equal(result.id, order.id);
      assert.equal(result.status, "refunded");
    },
  );
  await t.test(
    "partial and unrelated refunds do not revoke a valid purchase",
    async () => {
      const p = await product(),
        s = stub();
      await checkout(buyer, p.id, s.client);
      const order = await orderForSession(s.sessionId);
      await processStripeEvent(
        completed("evt_" + randomUUID(), order, s.sessionId),
        s.client,
      );
      await processStripeEvent(
        refunded("evt_" + randomUUID(), false),
        s.client,
      );
      assert.equal(s.lists.length, 0);
      s.setRefundSessions([
        {
          id: "cs_test_other_application",
          metadata: {},
          client_reference_id: null,
          amount_total: 999,
          currency: "usd",
          mode: "payment",
        },
      ]);
      await processStripeEvent(refunded("evt_" + randomUUID()), s.client);
      assert.equal((await orderForSession(s.sessionId)).status, "paid");
    },
  );
});
