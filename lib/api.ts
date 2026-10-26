import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { unzipSync } from "fflate";
import { query, transaction } from "./db";
import {
  currentUser,
  requireUser,
  guardOrigin,
  HttpError,
  hashPassword,
  verifyPassword,
  createSession,
  sessionCookie,
  requestToken,
  tokenHash,
  limitAuth,
} from "./auth";
import {
  registerSchema,
  loginSchema,
  productSchema,
  reviewSchema,
  requestSchema,
  idSchema,
} from "./validation";
import {
  checkout,
  paymentConnected,
  processStripeEvent,
  stripeClient,
} from "./payments";
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
async function limitedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Request is too large.");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function readJson(req: Request) {
  const text = new TextDecoder().decode(await limitedBody(req, 30000));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
function validateSourceZip(buffer: Buffer) {
  const invalid = () =>
    new HttpError(
      400,
      "The source ZIP has invalid or unsupported structure. Use a complete, unencrypted, single-disk ZIP with stored or deflated files.",
    );
  const maxEntries = 2000;
  const maxExpanded = 100 * 1024 * 1024;
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50)
    throw invalid();
  let end = buffer.length - 22;
  const earliest = Math.max(0, buffer.length - 65557);
  while (
    end >= earliest &&
    (buffer.readUInt32LE(end) !== 0x06054b50 ||
      end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length)
  )
    end--;
  if (
    end < earliest ||
    end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length
  )
    throw invalid();
  const entries = buffer.readUInt16LE(end + 10);
  if (!entries)
    throw new HttpError(400, "The source ZIP must contain at least one file.");
  if (entries > maxEntries)
    throw new HttpError(
      400,
      "The source ZIP may contain at most 2,000 entries.",
    );
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    buffer.readUInt16LE(end + 8) !== entries
  )
    throw invalid();
  if (end >= 20 && buffer.readUInt32LE(end - 20) === 0x07064b50)
    throw invalid();
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (!directorySize || directoryOffset + directorySize !== end)
    throw invalid();
  let cursor = directoryOffset;
  let expanded = 0;
  let files = 0;
  const names = new Set<string>();
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw invalid();
    const flags = buffer.readUInt16LE(cursor + 8);
    const compression = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const original = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      !nameLength ||
      next > end ||
      buffer.readUInt16LE(cursor + 34) ||
      flags & 0x41 ||
      ![0, 8].includes(compression) ||
      size === 0xffffffff ||
      original === 0xffffffff
    )
      throw invalid();
    expanded += original;
    if (expanded > maxExpanded)
      throw new HttpError(
        400,
        "The source ZIP declares more than 100 MiB of expanded contents.",
      );
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (
      names.has(name) ||
      name.includes("\0") ||
      /^[\\/]|^[A-Za-z]:/.test(name) ||
      name.split(/[\\/]/).includes("..")
    )
      throw invalid();
    names.add(name);
    if (!/[\\/]$/.test(name)) files++;
    if (
      offset + 30 > directoryOffset ||
      buffer.readUInt32LE(offset) !== 0x04034b50
    )
      throw invalid();
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const localExtraLength = buffer.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + localNameLength + localExtraLength;
    if (
      dataOffset + size > directoryOffset ||
      buffer.readUInt16LE(offset + 6) !== flags ||
      buffer.readUInt16LE(offset + 8) !== compression ||
      localNameLength !== nameLength ||
      !buffer
        .subarray(offset + 30, offset + 30 + localNameLength)
        .equals(nameBytes)
    )
      throw invalid();
    if (
      !(flags & 8) &&
      (buffer.readUInt32LE(offset + 18) !== size ||
        buffer.readUInt32LE(offset + 22) !== original)
    )
      throw invalid();
    if ((compression === 0 && size !== original) || (!size && original))
      throw invalid();
    let entryEnd = dataOffset + size;
    if (flags & 8) {
      if (entryEnd + 12 > directoryOffset) throw invalid();
      if (buffer.readUInt32LE(entryEnd) === 0x08074b50) entryEnd += 4;
      if (
        entryEnd + 12 > directoryOffset ||
        buffer.readUInt32LE(entryEnd + 4) !== size ||
        buffer.readUInt32LE(entryEnd + 8) !== original
      )
        throw invalid();
      entryEnd += 12;
    }
    ranges.push({ start: offset, end: entryEnd });
    cursor = next;
  }
  if (cursor !== end || !files) throw invalid();
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i].start < ranges[i - 1].end) throw invalid();
  try {
    let inspected = 0;
    unzipSync(buffer.subarray(0, end + 22), {
      filter: () => {
        inspected++;
        return false;
      },
    });
    if (inspected !== entries) throw invalid();
  } catch {
    throw invalid();
  }
}
const publicColumns = `p.id,p.name,p.description,p.category,p.technology,p.features,p.screenshots,p.price_cents,p.license,p.status,p.audit_status,p.audit_findings,p.review_note,p.reviewed_at,p.sample,p.accent,p.created_at,p.repository,p.seller_id,p.revision,(p.artifact_key IS NOT NULL) AS download_available,u.name AS seller_name`;
const artifactDir = () =>
  path.resolve(
    /*turbopackIgnore: true*/ process.env.ARTIFACT_DIR || "./data/artifacts",
  );
async function archiveResponse(
  key: string | null,
  hash: string | null,
  filename: string,
) {
  if (!key)
    throw new HttpError(
      503,
      "Source download is not connected for this project.",
    );
  if (!/^[a-f0-9-]+\.zip$/.test(key))
    throw new HttpError(500, "Invalid archive reference.");
  let data;
  try {
    data = await readFile(
      /*turbopackIgnore: true*/ path.join(
        /*turbopackIgnore: true*/ artifactDir(),
        key,
      ),
    );
  } catch {
    throw new HttpError(
      503,
      "The source archive is currently unavailable. Contact support.",
    );
  }
  if (createHash("sha256").update(data).digest("hex") !== hash)
    throw new HttpError(
      503,
      "Archive integrity check failed. Contact support.",
    );
  return new Response(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function handle(req: Request) {
  try {
    const parts = new URL(req.url).pathname
      .replace(/^\/api\//, "")
      .split("/")
      .filter(Boolean);
    const route = parts.join("/");
    const method = req.method;
    if (route === "stripe/webhook" && method === "POST") {
      if (!process.env.STRIPE_WEBHOOK_SECRET)
        throw new HttpError(503, "Stripe webhook is not connected.");
      let event;
      try {
        event = stripeClient().webhooks.constructEvent(
          new TextDecoder().decode(await limitedBody(req, 1000000)),
          req.headers.get("stripe-signature") || "",
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw new HttpError(400, "Invalid webhook signature.");
      }
      await processStripeEvent(event);
      return json({ received: true });
    }
    if (method !== "GET") guardOrigin(req);
    if (route === "config" && method === "GET")
      return json({
        payments: paymentConnected(),
        ai: false,
        deployment: false,
        expertBooking: false,
      });
    if (route === "auth/me" && method === "GET")
      return json({ user: await currentUser(req) });
    if (route === "auth/register" && method === "POST") {
      const b = registerSchema.parse(await readJson(req));
      await limitAuth(b.email);
      const id = randomUUID();
      const hash = await hashPassword(b.password);
      const row = await query(
        "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id,email,name,role",
        [id, b.email, b.name, hash, b.role],
      );
      if (!row.rowCount)
        throw new HttpError(
          409,
          "Unable to create this account. Try signing in instead.",
        );
      return json({ user: row.rows[0] }, 201, {
        "Set-Cookie": sessionCookie(await createSession(id)),
      });
    }
    if (route === "auth/login" && method === "POST") {
      const b = loginSchema.parse(await readJson(req));
      await limitAuth(b.email);
      const result = await query("SELECT * FROM users WHERE email=$1", [
        b.email,
      ]);
      const u = result.rows[0];
      // Use the same expensive password operation for unknown accounts.
      const valid = u
        ? await verifyPassword(b.password, u.password_hash)
        : (await hashPassword(b.password), false);
      if (!u || !valid || u.disabled)
        throw new HttpError(401, "Email or password is incorrect.");
      return json(
        { user: { id: u.id, email: u.email, name: u.name, role: u.role } },
        200,
        { "Set-Cookie": sessionCookie(await createSession(u.id)) },
      );
    }
    if (route === "auth/logout" && method === "POST") {
      const token = requestToken(req);
      if (token)
        await query("DELETE FROM sessions WHERE token_hash=$1", [
          tokenHash(token),
        ]);
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (route === "products" && method === "GET") {
      const params = new URL(req.url).searchParams;
      const values: unknown[] = [];
      const where = [`p.status='approved'`];
      const add = (sql: string, v: unknown) => {
        values.push(v);
        where.push(sql.replace("?", `$${values.length}`));
      };
      const search = params.get("q")?.slice(0, 100);
      if (search)
        add(
          `(p.name||' '||p.description||' '||p.category||' '||array_to_string(p.technology,' ')) ILIKE ?`,
          "%" + search.replace(/[%_\\]/g, "\\$&") + "%",
        );
      if (params.get("category")) add("p.category=?", params.get("category"));
      if (params.get("technology"))
        add(
          `array_to_string(p.technology,' ') ILIKE ?`,
          "%" +
            params
              .get("technology")!
              .slice(0, 60)
              .replace(/[%_\\]/g, "\\$&") +
            "%",
        );
      if (params.has("maxPrice")) {
        const price = z.coerce
          .number()
          .min(0)
          .max(100000)
          .parse(params.get("maxPrice"));
        add("p.price_cents<=?", Math.round(price * 100));
      }
      const sort = params.get("sort");
      const order =
        sort === "low"
          ? "p.price_cents ASC"
          : sort === "high"
            ? "p.price_cents DESC"
            : "p.created_at DESC";
      return json({
        products: (
          await query(
            `SELECT ${publicColumns} FROM products p JOIN users u ON u.id=p.seller_id WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 100`,
            values,
          )
        ).rows,
      });
    }
    if (parts[0] === "products" && parts.length === 2 && method === "GET") {
      const id = idSchema.parse(parts[1]);
      const result = await query(
        `SELECT ${publicColumns} FROM products p JOIN users u ON u.id=p.seller_id WHERE p.id=$1`,
        [id],
      );
      const p = result.rows[0];
      if (!p) throw new HttpError(404, "Project not found.");
      if (p.status !== "approved") {
        const u = await requireUser(req);
        if (u.id !== p.seller_id && u.role !== "admin")
          throw new HttpError(404, "Project not found.");
      }
      return json({ product: p });
    }
    if (route === "products" && method === "POST") {
      const user = await requireUser(req, ["builder", "admin"]);
      const b = productSchema.parse(await readJson(req));
      const id = randomUUID();
      await query(
        `INSERT INTO products(id,seller_id,name,description,category,technology,features,screenshots,price_cents,repository,license) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          user.id,
          b.name,
          b.description,
          b.category,
          b.technology,
          b.features,
          b.screenshots,
          b.price_cents,
          b.repository,
          b.license,
        ],
      );
      return json({ id, status: "pending", revision: 1 }, 201);
    }
    if (parts[0] === "products" && parts.length === 2 && method === "PATCH") {
      const user = await requireUser(req, ["builder", "admin"]);
      const id = idSchema.parse(parts[1]);
      const b = productSchema.parse(await readJson(req));
      const result = await query(
        `UPDATE products SET name=$1,description=$2,category=$3,technology=$4,features=$5,screenshots=$6,price_cents=$7,repository=$8,license=$9,status='pending',audit_status='not_reviewed',audit_findings='',review_note='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now(),revision=revision+1 WHERE id=$10 AND seller_id=$11 RETURNING id,revision`,
        [
          b.name,
          b.description,
          b.category,
          b.technology,
          b.features,
          b.screenshots,
          b.price_cents,
          b.repository,
          b.license,
          id,
          user.id,
        ],
      );
      if (!result.rowCount)
        throw new HttpError(404, "Your project was not found.");
      return json({ id, status: "pending", revision: result.rows[0].revision });
    }
    if (
      parts[0] === "products" &&
      parts[2] === "artifact" &&
      parts.length === 3 &&
      method === "GET"
    ) {
      const user = await requireUser(req);
      const id = idSchema.parse(parts[1]);
      const p = (
        await query(
          "SELECT seller_id,revision,artifact_key,artifact_sha256 FROM products WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!p || (p.seller_id !== user.id && user.role !== "admin"))
        throw new HttpError(
          403,
          "Only the project owner or an admin may inspect source.",
        );
      const revision = z.coerce
        .number()
        .int()
        .min(1)
        .max(2147483647)
        .parse(new URL(req.url).searchParams.get("revision"));
      if (revision !== p.revision)
        throw new HttpError(
          409,
          "This project changed. Refresh its details before inspecting source.",
        );
      return await archiveResponse(
        p.artifact_key,
        p.artifact_sha256,
        "review-source.zip",
      );
    }
    if (
      parts[0] === "products" &&
      parts[2] === "artifact" &&
      parts.length === 3 &&
      method === "POST"
    ) {
      const user = await requireUser(req, ["builder", "admin"]);
      const id = idSchema.parse(parts[1]);
      const p = (
        await query("SELECT seller_id FROM products WHERE id=$1", [id])
      ).rows[0];
      if (!p || (p.seller_id !== user.id && user.role !== "admin"))
        throw new HttpError(
          403,
          "Only the project owner or an admin may upload source.",
        );
      const max = 10 * 1024 * 1024;
      if (Number(req.headers.get("content-length") || 0) > max + 100000)
        throw new HttpError(413, "ZIP archives must be 10 MB or smaller.");
      const raw = await limitedBody(req, max + 100000);
      const form = await new Response(raw, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("archive");
      if (!(file instanceof File) || file.size > max || file.size < 4)
        throw new HttpError(400, "Choose a ZIP file smaller than 10 MB.");
      const buffer = Buffer.from(await file.arrayBuffer());
      validateSourceZip(buffer);
      const key = randomUUID() + ".zip";
      await mkdir(artifactDir(), { recursive: true });
      await writeFile(path.join(artifactDir(), key), buffer, {
        flag: "wx",
        mode: 0o600,
      });
      await query(
        `UPDATE products SET artifact_key=$1,artifact_sha256=$2,artifact_name='source.zip',status='pending',audit_status='not_reviewed',audit_findings='',review_note='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now(),revision=revision+1 WHERE id=$3`,
        [key, createHash("sha256").update(buffer).digest("hex"), id],
      );
      return json({ ok: true, status: "pending" });
    }
    if (
      parts[0] === "admin" &&
      parts[1] === "reviews" &&
      parts.length === 3 &&
      method === "POST"
    ) {
      const user = await requireUser(req, ["admin"]);
      const id = idSchema.parse(parts[2]);
      const b = reviewSchema.parse(await readJson(req));
      await transaction(async (c) => {
        const result = await c.query(
          `UPDATE products SET status=$1,audit_status=$2,audit_findings=$3,review_note=$4,reviewed_by=$5,reviewed_at=now(),updated_at=now(),revision=revision+1 WHERE id=$6 AND revision=$7 RETURNING id,revision`,
          [
            b.status,
            b.audit_status,
            b.audit_findings,
            b.review_note,
            user.id,
            id,
            b.expected_revision,
          ],
        );
        if (!result.rowCount) {
          const exists = await c.query("SELECT id FROM products WHERE id=$1", [
            id,
          ]);
          if (!exists.rowCount) throw new HttpError(404, "Project not found.");
          throw new HttpError(
            409,
            "This project changed. Refresh and inspect the latest revision before recording a review.",
          );
        }
        await c.query(
          "INSERT INTO admin_actions(id,admin_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), user.id, "project_review", id, JSON.stringify(b)],
        );
      });
      return json({ ok: true });
    }
    if (route === "checkout" && method === "POST") {
      const user = await requireUser(req, ["buyer"]);
      const b = z
        .object({ product_id: z.uuid() })
        .strict()
        .parse(await readJson(req));
      return json(await checkout(user, b.product_id));
    }
    if (parts[0] === "downloads" && parts.length === 2 && method === "GET") {
      const user = await requireUser(req, ["buyer"]);
      const id = idSchema.parse(parts[1]);
      const { rows } = await query(
        `SELECT o.artifact_key,o.artifact_sha256 FROM orders o WHERE o.id=$1 AND o.buyer_id=$2 AND o.status='paid'`,
        [id, user.id],
      );
      const p = rows[0];
      if (!p)
        throw new HttpError(
          403,
          "A confirmed payment for this order is required.",
        );
      return await archiveResponse(
        p.artifact_key,
        p.artifact_sha256,
        "licensed-source.zip",
      );
    }
    if (route === "requests" && method === "POST") {
      const user = await requireUser(req);
      const b = requestSchema.parse(await readJson(req));
      if (b.product_id) {
        const owned = await query(
          "SELECT id FROM orders WHERE buyer_id=$1 AND product_id=$2 AND status='paid'",
          [user.id, b.product_id],
        );
        if (!owned.rowCount)
          throw new HttpError(
            403,
            "A confirmed purchase is required to request changes to this project.",
          );
      }
      const id = randomUUID();
      await query(
        "INSERT INTO requests(id,user_id,product_id,kind,description) VALUES($1,$2,$3,$4,$5)",
        [id, user.id, b.product_id || null, b.kind, b.description],
      );
      return json({ id, status: "submitted" }, 201);
    }
    if (route === "workspace" && method === "GET") {
      const user = await requireUser(req);
      const orders = await query(
        `SELECT o.id,o.product_id,o.total_cents,o.status,o.created_at,o.license_snapshot,p.name,(o.artifact_key IS NOT NULL) AS download_available FROM orders o JOIN products p ON p.id=o.product_id WHERE o.buyer_id=$1 ORDER BY o.created_at DESC`,
        [user.id],
      );
      const products =
        user.role !== "buyer"
          ? await query(
              `SELECT ${publicColumns} FROM products p JOIN users u ON u.id=p.seller_id WHERE p.seller_id=$1 ORDER BY p.updated_at DESC`,
              [user.id],
            )
          : { rows: [] };
      const requests = await query(
        "SELECT r.*,p.name AS product_name FROM requests r LEFT JOIN products p ON p.id=r.product_id WHERE r.user_id=$1 ORDER BY r.created_at DESC",
        [user.id],
      );
      return json({
        orders: orders.rows,
        products: products.rows,
        requests: requests.rows,
      });
    }
    if (route === "admin" && method === "GET") {
      await requireUser(req, ["admin"]);
      return json({
        products: (
          await query(
            `SELECT ${publicColumns} FROM products p JOIN users u ON u.id=p.seller_id ORDER BY (p.status='pending') DESC,p.updated_at DESC`,
          )
        ).rows,
        users: (
          await query(
            "SELECT id,name,email,role,disabled,created_at FROM users ORDER BY created_at DESC",
          )
        ).rows,
        requests: (
          await query(
            "SELECT r.*,u.name AS user_name FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC",
          )
        ).rows,
        actions: (
          await query(
            "SELECT a.*,u.name AS admin_name FROM admin_actions a JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 30",
          )
        ).rows,
      });
    }
    if (
      parts[0] === "admin" &&
      parts[1] === "users" &&
      parts.length === 3 &&
      method === "PATCH"
    ) {
      const admin = await requireUser(req, ["admin"]);
      const id = idSchema.parse(parts[2]);
      const b = z
        .object({ disabled: z.boolean() })
        .strict()
        .parse(await readJson(req));
      if (id === admin.id)
        throw new HttpError(400, "You cannot disable your own account.");
      await transaction(async (c) => {
        const target = (
          await c.query("SELECT role FROM users WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!target) throw new HttpError(404, "Account not found.");
        if (target.role === "admin")
          throw new HttpError(
            403,
            "Admin accounts cannot be disabled through this interface.",
          );
        await c.query("UPDATE users SET disabled=$1 WHERE id=$2", [
          b.disabled,
          id,
        ]);
        if (b.disabled)
          await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
        await c.query(
          "INSERT INTO admin_actions(id,admin_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), admin.id, "account_status", id, JSON.stringify(b)],
        );
      });
      return json({ ok: true });
    }
    if (
      parts[0] === "admin" &&
      parts[1] === "requests" &&
      parts.length === 3 &&
      method === "PATCH"
    ) {
      const admin = await requireUser(req, ["admin"]);
      const id = idSchema.parse(parts[2]);
      const b = z
        .object({
          status: z.enum(["submitted", "in_review", "completed", "closed"]),
          admin_note: z.string().trim().min(5).max(2000),
        })
        .strict()
        .parse(await readJson(req));
      await transaction(async (c) => {
        const result = await c.query(
          "UPDATE requests SET status=$1,admin_note=$2 WHERE id=$3 RETURNING id",
          [b.status, b.admin_note, id],
        );
        if (!result.rowCount) throw new HttpError(404, "Request not found.");
        await c.query(
          "INSERT INTO admin_actions(id,admin_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), admin.id, "request_update", id, JSON.stringify(b)],
        );
      });
      return json({ ok: true });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(
      "API error:",
      e instanceof Error ? e.message : "Unknown error",
    );
    return json(
      {
        error:
          "Service unavailable. Check the database connection and server logs, then try again.",
      },
      503,
    );
  }
}
