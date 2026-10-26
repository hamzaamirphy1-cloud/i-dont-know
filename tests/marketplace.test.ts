import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { zipSync, strToU8 } from "fflate";
import { pool, query } from "../lib/db";
import { handle } from "../lib/api";
import { hashPassword } from "../lib/auth";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test. Tests never run on the application database.",
  );
process.env.DATABASE_URL = testUrl;
process.env.APP_URL = "http://localhost:3000";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
const origin = "http://localhost:3000";
const password = "An-example-password-2026!";
let tempDir: string;
const adminId = randomUUID();
let builderCookie = "",
  buyerCookie = "",
  otherCookie = "",
  adminCookie = "",
  productId = "",
  orderId = "",
  archiveKey = "",
  archiveHash = "";
const zip = zipSync({
  "README.md": strToU8(
    "Source archive used only by integration tests. Not a marketplace product.",
  ),
});
async function request(
  route: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  customHeaders: Record<string, string> = {},
) {
  const form = body instanceof FormData;
  const req = new Request(origin + "/api/" + route, {
    method,
    headers: {
      origin,
      ...(!form ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...customHeaders,
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return handle(req);
}
const cookie = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
const fixture = {
  name: "Test Clinic",
  description:
    "An appointment management platform for small independent clinics.",
  category: "Healthcare",
  technology: ["Next.js", "PostgreSQL"],
  features: ["Appointments", "Patient profiles"],
  screenshots: ["https://example.com/clinic.png"],
  price_cents: 14900,
  repository: "https://github.com/example/clinic",
  license:
    "One business installation. No source redistribution. Builder retains copyright.",
};
before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "vibe96-tests-"));
  process.env.ARTIFACT_DIR = tempDir;
  await query(
    await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8"),
  );
  await query(
    "TRUNCATE admin_actions,requests,stripe_events,orders,products,sessions,auth_limits,users CASCADE",
  );
  await query(
    "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
    [
      adminId,
      "admin@test.local",
      "Test Admin",
      await hashPassword(password),
      "admin",
    ],
  );
});
after(async () => {
  await pool().end();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test("marketplace security and purchase lifecycle", async (t) => {
  await t.test(
    "registration validates input and prevents self-assigned admin roles",
    async () => {
      assert.equal(
        (
          await request("auth/register", "POST", {
            name: "Admin",
            email: "bad@test.local",
            password,
            role: "admin",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("auth/register", "POST", {
            name: "Buyer",
            email: "bad@test.local",
            password: "short",
            role: "buyer",
          })
        ).status,
        400,
      );
      const result = await request("auth/register", "POST", {
        name: "Builder",
        email: "builder@test.local",
        password,
        role: "builder",
      });
      assert.equal(result.status, 201);
      builderCookie = cookie(result);
      const b = await result.json();
      assert.equal(b.user.role, "builder");
      assert.equal(b.user.password_hash, undefined);
      assert.match(result.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
      const buyer = await request("auth/register", "POST", {
        name: "Buyer",
        email: "buyer@test.local",
        password,
        role: "buyer",
      });
      buyerCookie = cookie(buyer);
      const other = await request("auth/register", "POST", {
        name: "Other",
        email: "other@test.local",
        password,
        role: "buyer",
      });
      otherCookie = cookie(other);
      const admin = await request("auth/login", "POST", {
        email: "admin@test.local",
        password,
      });
      assert.equal(admin.status, 200);
      adminCookie = cookie(admin);
    },
  );
  await t.test(
    "session cookies resolve users and authentication rejects incorrect passwords",
    async () => {
      assert.equal(
        (
          await request("auth/login", "POST", {
            email: "buyer@test.local",
            password: "incorrect password",
          })
        ).status,
        401,
      );
      const result = await (
        await request("auth/me", "GET", undefined, buyerCookie)
      ).json();
      assert.equal(result.user.role, "buyer");
      assert.equal(
        (await request("workspace", "GET", undefined, "vibe96_session=forged"))
          .status,
        401,
      );
    },
  );
  await t.test("origin checking blocks cross-site mutations", async () => {
    assert.equal(
      (
        await request("products", "POST", fixture, builderCookie, {
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
  });
  await t.test(
    "only builders can submit, and submissions remain hidden until approved",
    async () => {
      assert.equal((await request("products", "POST", fixture)).status, 401);
      assert.equal(
        (await request("products", "POST", fixture, buyerCookie)).status,
        403,
      );
      const result = await request("products", "POST", fixture, builderCookie);
      assert.equal(result.status, 201);
      const p = await result.json();
      productId = p.id;
      assert.equal(p.status, "pending");
      assert.equal(
        (await (await request("products")).json()).products.length,
        0,
      );
      assert.equal(
        (await request("products/" + productId, "GET", undefined, buyerCookie))
          .status,
        404,
      );
    },
  );
  await t.test(
    "admin-only approvals require explicit findings for reviewed status",
    async () => {
      const review = {
        expected_revision: (
          await query("SELECT revision FROM products WHERE id=$1", [productId])
        ).rows[0].revision,
        status: "approved",
        review_note: "Metadata reviewed by the administrator.",
        audit_status: "reviewed",
        audit_findings: "",
      };
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            review,
            builderCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            review,
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            {
              ...review,
              audit_findings:
                "Repository metadata and license checked. No runtime security or compliance audit performed.",
            },
            adminCookie,
          )
        ).status,
        200,
      );
      const result = await (await request("products/" + productId)).json();
      assert.equal(result.product.audit_status, "reviewed");
      assert.ok(result.product.reviewed_at);
      assert.equal(result.product.revision, review.expected_revision + 1);
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            {
              ...review,
              audit_findings:
                "The review form was left open before an earlier decision was saved.",
            },
            adminCookie,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "catalog filters use database values and treat SQL-like search as data",
    async () => {
      assert.equal(
        (
          await (
            await request(
              "products?category=Healthcare&technology=Next.js&maxPrice=150",
            )
          ).json()
        ).products.length,
        1,
      );
      assert.equal(
        (await (await request("products?maxPrice=100")).json()).products.length,
        0,
      );
      assert.equal(
        (
          await (
            await request("products?q=" + encodeURIComponent("' OR 1=1 --"))
          ).json()
        ).products.length,
        0,
      );
    },
  );
  await t.test(
    "edits are owner-only and invalidate existing review claims",
    async () => {
      assert.equal(
        (await request("products/" + productId, "PATCH", fixture, adminCookie))
          .status,
        404,
      );
      assert.equal(
        (
          await request(
            "products/" + productId,
            "PATCH",
            { ...fixture, name: "Updated Clinic" },
            builderCookie,
          )
        ).status,
        200,
      );
      const result = await (
        await request("products/" + productId, "GET", undefined, builderCookie)
      ).json();
      assert.equal(result.product.status, "pending");
      assert.equal(result.product.audit_status, "not_reviewed");
      assert.equal(result.product.audit_findings, "");
    },
  );
  await t.test(
    "stale reviews cannot approve a builder's unseen metadata changes",
    async () => {
      const snapshot = (
        await query("SELECT revision FROM products WHERE id=$1", [productId])
      ).rows[0];
      assert.equal(
        (
          await request(
            "products/" + productId,
            "PATCH",
            fixture,
            builderCookie,
          )
        ).status,
        200,
      );
      const result = await request(
        "admin/reviews/" + productId,
        "POST",
        {
          expected_revision: snapshot.revision,
          status: "approved",
          audit_status: "reviewed",
          audit_findings:
            "This describes the earlier version, not the builder's newly submitted changes.",
          review_note: "Reviewed the earlier metadata snapshot.",
        },
        adminCookie,
      );
      assert.equal(result.status, 409);
      const latest = (
        await query(
          "SELECT revision,status,audit_status FROM products WHERE id=$1",
          [productId],
        )
      ).rows[0];
      assert.equal(latest.revision, snapshot.revision + 1);
      assert.equal(latest.status, "pending");
      assert.equal(latest.audit_status, "not_reviewed");
    },
  );
  await t.test(
    "source ZIP structure rejects truncation, unsupported formats and excessive declared contents without extracting",
    async () => {
      const original = Buffer.from(zip);
      const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      const end = original.length - 22;
      assert.ok(central > 0);
      const tooMany = Buffer.from(original);
      tooMany.writeUInt16LE(2001, end + 8);
      tooMany.writeUInt16LE(2001, end + 10);
      const tooExpanded = Buffer.from(original);
      tooExpanded.writeUInt32LE(100 * 1024 * 1024 + 1, central + 24);
      const badDirectory = Buffer.from(original);
      badDirectory.writeUInt32LE(original.length + 100, end + 16);
      const badRange = Buffer.from(original);
      badRange.writeUInt32LE(original.length + 100, central + 20);
      badRange.writeUInt32LE(original.length + 100, 18);
      const encrypted = Buffer.from(original);
      encrypted.writeUInt16LE(
        encrypted.readUInt16LE(central + 8) | 1,
        central + 8,
      );
      encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6);
      const cases = [
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        original.subarray(0, original.length - 12),
        tooMany,
        tooExpanded,
        badDirectory,
        badRange,
        encrypted,
        zipSync({ "empty/": strToU8("") }),
        zipSync({ "../outside.txt": strToU8("unsafe archive path") }),
      ];
      const before = (
        await query("SELECT revision FROM products WHERE id=$1", [productId])
      ).rows[0].revision;
      for (const [index, data] of cases.entries()) {
        const form = new FormData();
        form.set(
          "archive",
          new File([data], "invalid.zip", { type: "application/zip" }),
        );
        const response = await request(
          "products/" + productId + "/artifact",
          "POST",
          form,
          builderCookie,
        );
        assert.equal(
          response.status,
          400,
          `invalid ZIP fixture ${index} must be rejected`,
        );
      }
      const after = (
        await query("SELECT revision,artifact_key FROM products WHERE id=$1", [
          productId,
        ])
      ).rows[0];
      assert.equal(after.revision, before);
      assert.equal(after.artifact_key, null);
    },
  );
  await t.test(
    "source upload is private, validates ZIP format and requires reapproval",
    async () => {
      const bad = new FormData();
      bad.set("archive", new File(["not a zip"], "source.zip"));
      assert.equal(
        (
          await request(
            "products/" + productId + "/artifact",
            "POST",
            bad,
            builderCookie,
          )
        ).status,
        400,
      );
      const form = new FormData();
      form.set(
        "archive",
        new File([zip], "source.zip", { type: "application/zip" }),
      );
      assert.equal(
        (
          await request(
            "products/" + productId + "/artifact",
            "POST",
            form,
            buyerCookie,
          )
        ).status,
        403,
      );
      const good = new FormData();
      good.set(
        "archive",
        new File([zip], "source.zip", { type: "application/zip" }),
      );
      assert.equal(
        (
          await request(
            "products/" + productId + "/artifact",
            "POST",
            good,
            builderCookie,
          )
        ).status,
        200,
      );
      const p = (await query("SELECT * FROM products WHERE id=$1", [productId]))
        .rows[0];
      assert.equal(p.status, "pending");
      archiveKey = p.artifact_key;
      archiveHash = p.artifact_sha256;
      assert.equal(archiveHash, createHash("sha256").update(zip).digest("hex"));
      assert.equal(p.review_note, "");
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            {
              expected_revision: p.revision - 1,
              status: "approved",
              audit_status: "reviewed",
              audit_findings:
                "This describes the old source, not the archive that was just uploaded.",
              review_note: "Reviewed the earlier source version.",
            },
            adminCookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "admin/reviews/" + productId,
            "POST",
            {
              expected_revision: p.revision,
              status: "approved",
              audit_status: "not_reviewed",
              audit_findings: "",
              review_note: "Metadata approved, no independent security audit.",
            },
            adminCookie,
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    "owners and admins can inspect the exact private archive revision; other accounts cannot",
    async () => {
      const p = (
        await query("SELECT revision FROM products WHERE id=$1", [productId])
      ).rows[0];
      const route =
        "products/" + productId + "/artifact?revision=" + p.revision;
      assert.equal((await request(route)).status, 401);
      assert.equal(
        (await request(route, "GET", undefined, buyerCookie)).status,
        403,
      );
      assert.equal(
        (await request(route, "GET", undefined, otherCookie)).status,
        403,
      );
      assert.equal(
        (
          await request(
            "products/" + productId + "/artifact",
            "GET",
            undefined,
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "products/" + productId + "/artifact?revision=" + (p.revision - 1),
            "GET",
            undefined,
            adminCookie,
          )
        ).status,
        409,
      );
      for (const actor of [builderCookie, adminCookie]) {
        const response = await request(route, "GET", undefined, actor);
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
        assert.equal(
          response.headers.get("content-disposition"),
          'attachment; filename="review-source.zip"',
        );
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip);
      }
      await writeFile(path.join(tempDir, archiveKey), "tampered");
      assert.equal(
        (await request(route, "GET", undefined, adminCookie)).status,
        503,
      );
      await writeFile(path.join(tempDir, archiveKey), zip);
    },
  );
  await t.test(
    "checkout is buyer-only, rejects forged totals and clearly fails without Stripe configuration",
    async () => {
      assert.equal(
        (
          await request(
            "checkout",
            "POST",
            { product_id: productId },
            builderCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "checkout",
            "POST",
            { product_id: productId, total_cents: 1 },
            buyerCookie,
          )
        ).status,
        400,
      );
      const result = await request(
        "checkout",
        "POST",
        { product_id: productId },
        buyerCookie,
      );
      assert.equal(result.status, 503);
      assert.match((await result.json()).error, /not connected/i);
      assert.equal((await query("SELECT id FROM orders")).rowCount, 0);
    },
  );
  await t.test(
    "pending orders do not grant downloads; webhook signatures and exact payment amounts are required",
    async () => {
      const buyer = (
        await query("SELECT id FROM users WHERE email=$1", ["buyer@test.local"])
      ).rows[0];
      orderId = randomUUID();
      await query(
        "INSERT INTO orders(id,buyer_id,product_id,total_cents,license_snapshot,stripe_session_id,artifact_key,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          orderId,
          buyer.id,
          productId,
          14900,
          fixture.license,
          "cs_test_integration",
          archiveKey,
          archiveHash,
        ],
      );
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, buyerCookie))
          .status,
        403,
      );
      process.env.STRIPE_SECRET_KEY =
        "sk_test_integration_fixture_not_a_real_key";
      process.env.STRIPE_WEBHOOK_SECRET =
        "whsec_integration_fixture_not_a_real_secret";
      assert.equal(
        (
          await request("stripe/webhook", "POST", {
            type: "checkout.session.completed",
          })
        ).status,
        400,
      );
      const result = await webhook("evt_bad_amount", 1, "paid");
      assert.equal(result.status, 400);
      assert.equal(
        (await query("SELECT status FROM orders WHERE id=$1", [orderId]))
          .rows[0].status,
        "pending",
      );
      assert.equal((await webhook("evt_unpaid", 14900, "unpaid")).status, 200);
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, buyerCookie))
          .status,
        403,
      );
    },
  );
  await t.test(
    "verified paid webhook grants exactly one purchase and is idempotent",
    async () => {
      assert.equal((await webhook("evt_paid", 14900, "paid")).status, 200);
      assert.equal((await webhook("evt_paid", 14900, "paid")).status, 200);
      const result = (
        await query("SELECT * FROM orders WHERE id=$1", [orderId])
      ).rows[0];
      assert.equal(result.status, "paid");
      assert.ok(result.paid_at);
      assert.equal(
        (await query("SELECT id FROM stripe_events WHERE id=$1", ["evt_paid"]))
          .rowCount,
        1,
      );
    },
  );
  await t.test(
    "only the purchasing buyer can download the exact checked archive",
    async () => {
      assert.equal((await request("downloads/" + orderId)).status, 401);
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, otherCookie))
          .status,
        403,
      );
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, builderCookie))
          .status,
        403,
      );
      const result = await request(
        "downloads/" + orderId,
        "GET",
        undefined,
        buyerCookie,
      );
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("content-type"), "application/zip");
      assert.deepEqual(new Uint8Array(await result.arrayBuffer()), zip);
      // A later builder update cannot silently replace a buyer's purchased source version.
      await query("UPDATE products SET artifact_key=$1 WHERE id=$2", [
        randomUUID() + ".zip",
        productId,
      ]);
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, buyerCookie))
          .status,
        200,
      );
    },
  );
  await t.test(
    "corrupt artifacts fail closed; refunded orders lose download access",
    async () => {
      await writeFile(path.join(tempDir, archiveKey), "tampered");
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, buyerCookie))
          .status,
        503,
      );
      await writeFile(path.join(tempDir, archiveKey), zip);
      await query("UPDATE orders SET status='refunded' WHERE id=$1", [orderId]);
      assert.equal(
        (await request("downloads/" + orderId, "GET", undefined, buyerCookie))
          .status,
        403,
      );
      assert.equal(
        (await webhook("evt_paid_after_refund", 14900, "paid")).status,
        200,
      );
      assert.equal(
        (await query("SELECT status FROM orders WHERE id=$1", [orderId]))
          .rows[0].status,
        "refunded",
      );
      await query("UPDATE orders SET status='paid' WHERE id=$1", [orderId]);
    },
  );
  await t.test(
    "customization requires ownership, requests persist, and admin progress is recorded",
    async () => {
      const body = {
        kind: "customization",
        description: "Please add an appointment reminder workflow.",
        product_id: productId,
      };
      assert.equal(
        (await request("requests", "POST", body, otherCookie)).status,
        403,
      );
      const result = await request("requests", "POST", body, buyerCookie);
      assert.equal(result.status, 201);
      const id = (await result.json()).id;
      assert.equal(
        (
          await request(
            "admin/requests/" + id,
            "PATCH",
            {
              status: "in_review",
              admin_note:
                "Reviewing the scope, no developer has been assigned.",
            },
            adminCookie,
          )
        ).status,
        200,
      );
      const work = await (
        await request("workspace", "GET", undefined, buyerCookie)
      ).json();
      assert.equal(work.requests[0].status, "in_review");
      assert.equal(work.orders[0].status, "paid");
      const admin = await (
        await request("admin", "GET", undefined, adminCookie)
      ).json();
      assert.ok(admin.actions.length >= 3);
      assert.ok(!("password_hash" in admin.users[0]));
    },
  );
  await t.test(
    "disabling a user invalidates all their sessions; administrators cannot disable themselves",
    async () => {
      const other = (
        await query("SELECT id FROM users WHERE email=$1", ["other@test.local"])
      ).rows[0];
      assert.equal(
        (
          await request(
            "admin/users/" + other.id,
            "PATCH",
            { disabled: true },
            buyerCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "admin/users/" + adminId,
            "PATCH",
            { disabled: true },
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "admin/users/" + other.id,
            "PATCH",
            { disabled: true },
            adminCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("workspace", "GET", undefined, otherCookie)).status,
        401,
      );
    },
  );
  await t.test(
    "oversized request bodies are bounded even without a content length",
    async () => {
      const response = await handle(
        new Request(origin + "/api/auth/register", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ value: "x".repeat(31000) }),
        }),
      );
      assert.equal(response.status, 413);
    },
  );
  await t.test("expired sessions cannot open a workspace", async () => {
    await query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id IN (SELECT id FROM users WHERE email=$1)",
      ["builder@test.local"],
    );
    assert.equal(
      (await request("workspace", "GET", undefined, builderCookie)).status,
      401,
    );
  });
  await t.test("logout revokes the session in the database", async () => {
    assert.equal(
      (await request("auth/logout", "POST", {}, buyerCookie)).status,
      200,
    );
    assert.equal(
      (await request("workspace", "GET", undefined, buyerCookie)).status,
      401,
    );
  });
});
async function webhook(id: string, amount: number, paymentStatus: string) {
  const event = {
    id,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_integration",
        metadata: { order_id: orderId },
        client_reference_id: orderId,
        amount_total: amount,
        currency: "usd",
        payment_status: paymentStatus,
        mode: "payment",
      },
    },
  };
  const payload = JSON.stringify(event);
  const stripe = new Stripe("sk_test_integration_fixture_not_a_real_key");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return handle(
    new Request(origin + "/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  );
}
