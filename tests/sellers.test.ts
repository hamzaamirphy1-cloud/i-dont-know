import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, query } from "../lib/db";
import { GET } from "../app/api/sellers/[id]/route";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test"))
  throw Error(
    "Seller tests require a dedicated TEST_DATABASE_URL ending in _test.",
  );
const schema = "sellers_" + randomUUID().replaceAll("-", "");
const url = new URL(database);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.href;
const seller = randomUUID(),
  buyer = randomUUID();
before(async () => {
  await query(`CREATE SCHEMA ${schema}`);
  await query(
    await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8"),
  );
  for (const [id, role] of [
    [seller, "builder"],
    [buyer, "buyer"],
  ])
    await query(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [id, id + "@test.local", "Public Builder", "private hash", role],
    );
  for (const status of ["approved", "pending", "rejected"])
    await query(
      `INSERT INTO products(id,seller_id,name,description,category,price_cents,repository,license,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        seller,
        status + " project",
        "A project in a seller profile fixture.",
        "Productivity",
        10000,
        "https://github.com/example/project",
        "A valid one-installation license.",
        status,
      ],
    );
});
after(async () => {
  await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool().end();
});
const get = (id: string) =>
  GET(new Request("http://localhost:3000/api/sellers/" + id), {
    params: Promise.resolve({ id }),
  });
test("public seller profiles expose only public identity and approved projects", async () => {
  const response = await get(seller);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.seller.name, "Public Builder");
  assert.equal(data.seller.email, undefined);
  assert.equal(data.seller.password_hash, undefined);
  assert.equal(data.products.length, 1);
  assert.equal(data.products[0].name, "approved project");
  assert.equal(data.products[0].artifact_key, undefined);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("buyer accounts and unknown identities have no public builder profile", async () => {
  assert.equal((await get(buyer)).status, 404);
  assert.equal((await get(randomUUID())).status, 404);
  assert.equal((await get("not-a-uuid")).status, 400);
});
test("disabled accounts do not expose a public seller profile", async () => {
  await query("UPDATE users SET disabled=true WHERE id=$1", [seller]);
  assert.equal((await get(seller)).status, 404);
});
