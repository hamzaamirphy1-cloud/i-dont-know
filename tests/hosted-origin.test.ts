import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationOrigin, secureSessionCookie } from "../lib/hosted";
test("local origins stay explicit and secure cookie behavior stays compatible", () => {
  assert.equal(applicationOrigin({}), undefined);
  assert.equal(
    applicationOrigin({ APP_URL: "http://localhost:3000/" }),
    "http://localhost:3000",
  );
  assert.equal(secureSessionCookie({}), false);
  assert.equal(secureSessionCookie({ COOKIE_SECURE: "true" }), true);
});
test("production and preview deployments use their own provider-owned hostname", () => {
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "vibe96.example.com",
    VERCEL_URL: "vibe96-abc.vercel.app",
  };
  assert.equal(applicationOrigin(env), "https://vibe96.example.com");
  assert.equal(
    applicationOrigin({ ...env, VERCEL_ENV: "preview" }),
    "https://vibe96-abc.vercel.app",
  );
  assert.equal(
    applicationOrigin({ ...env, APP_URL: "https://custom.example.com" }),
    "https://custom.example.com",
  );
  assert.equal(secureSessionCookie({ ...env, COOKIE_SECURE: "false" }), true);
});
test("unsafe, path-based and non-HTTPS hosted origins are rejected", () => {
  for (const APP_URL of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
  ])
    assert.throws(() => applicationOrigin({ APP_URL }));
  assert.throws(() =>
    applicationOrigin({ VERCEL: "1", APP_URL: "http://localhost:3000" }),
  );
  assert.throws(() =>
    applicationOrigin({ VERCEL: "1", VERCEL_URL: "example.com/path" }),
  );
});
