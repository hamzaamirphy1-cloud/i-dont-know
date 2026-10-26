import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hostedPreparationPlan,
  HostedConfigurationError,
} from "../scripts/hosted-prepare";

const database = "postgresql://example:fixture@db.example.test:5432/vibe96";
const prepare = { PREPARE_DATABASE_ON_BUILD: "true", DATABASE_URL: database };
const root = fileURLToPath(new URL("../", import.meta.url));

test("plain builds skip database mutations and do not require credentials", () => {
  assert.deepEqual(hostedPreparationPlan({}), {
    prepareDatabase: false,
    seedDemo: false,
  });
  assert.deepEqual(
    hostedPreparationPlan({
      PREPARE_DATABASE_ON_BUILD: "false",
      SEED_DEMO: "true",
    }),
    { prepareDatabase: false, seedDemo: false },
  );
});

test("opt-in hosted migration requires an explicit valid PostgreSQL connection", () => {
  assert.throws(
    () => hostedPreparationPlan({ PREPARE_DATABASE_ON_BUILD: "true" }),
    /DATABASE_URL is required/,
  );
  for (const value of [
    "not a URL",
    "https://example.test/db",
    "postgresql://host/",
  ])
    assert.throws(
      () => hostedPreparationPlan({ ...prepare, DATABASE_URL: value }),
      HostedConfigurationError,
    );
  assert.deepEqual(hostedPreparationPlan(prepare), {
    prepareDatabase: true,
    seedDemo: false,
  });
});

test("hosted seeding rejects the documented local password and weak values", () => {
  for (const password of [
    undefined,
    "Vibe96-demo-2026!",
    " vibe96-DEMO-2026! ",
    "short-123",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "abcdefghijklmnop",
  ])
    assert.throws(
      () =>
        hostedPreparationPlan({
          ...prepare,
          SEED_DEMO: "true",
          SEED_PASSWORD: password,
        }),
      /custom SEED_PASSWORD/,
    );
});

test("custom strong seed passwords are accepted without being returned", () => {
  const result = hostedPreparationPlan({
    ...prepare,
    SEED_DEMO: "true",
    SEED_PASSWORD: "Generated-Fixture-Only-42!",
  });
  assert.deepEqual(result, { prepareDatabase: true, seedDemo: true });
  assert.equal(JSON.stringify(result).includes("Fixture"), false);
});

test("unrecognized build preparation and seeding flags fail explicitly", () => {
  assert.throws(
    () => hostedPreparationPlan({ PREPARE_DATABASE_ON_BUILD: "yes" }),
    /PREPARE_DATABASE_ON_BUILD must be true or false/,
  );
  assert.throws(
    () => hostedPreparationPlan({ ...prepare, SEED_DEMO: "1" }),
    /SEED_DEMO must be true or false/,
  );
});

test("CLI refuses the local seed password before attempting database access", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "scripts/hosted-prepare.ts"),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PREPARE_DATABASE_ON_BUILD: "true",
        DATABASE_URL:
          "postgresql://fixture:private-value@127.0.0.1:1/unavailable",
        SEED_DEMO: "true",
        SEED_PASSWORD: "Vibe96-demo-2026!",
      },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /custom SEED_PASSWORD/);
  assert.doesNotMatch(result.stderr, /private-value|ECONNREFUSED/);
});
