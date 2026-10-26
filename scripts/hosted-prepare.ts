import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import pg from "pg";

/**
 * Database changes at build time are explicitly opt-in. Plain Next.js builds
 * remain possible before a deployment's managed database is connected.
 */
export type HostedPreparationPlan = {
  prepareDatabase: boolean;
  seedDemo: boolean;
};

export class HostedConfigurationError extends Error {}

const localDemoPassword = "Vibe96-demo-2026!";

function enabled(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new HostedConfigurationError(`${name} must be true or false.`);
}

export function hostedPreparationPlan(
  env: Record<string, string | undefined>,
): HostedPreparationPlan {
  const prepareDatabase = enabled(
    env.PREPARE_DATABASE_ON_BUILD,
    "PREPARE_DATABASE_ON_BUILD",
  );
  if (!prepareDatabase) return { prepareDatabase: false, seedDemo: false };

  if (!env.DATABASE_URL)
    throw new HostedConfigurationError(
      "DATABASE_URL is required when PREPARE_DATABASE_ON_BUILD=true. Connect a managed PostgreSQL database in the hosting project's environment settings.",
    );
  try {
    const database = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !database.hostname ||
      database.pathname.length < 2
    )
      throw new Error("Invalid PostgreSQL URL");
  } catch {
    throw new HostedConfigurationError(
      "DATABASE_URL must be a PostgreSQL connection URL with a hostname and database name. Enter it privately in environment settings.",
    );
  }

  const seedDemo = enabled(env.SEED_DEMO, "SEED_DEMO");
  if (seedDemo) {
    const password = env.SEED_PASSWORD || "";
    const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(
      (pattern) => pattern.test(password),
    ).length;
    if (
      password.trim().toLowerCase() === localDemoPassword.toLowerCase() ||
      password.length < 16 ||
      password.length > 128 ||
      new Set(password).size < 8 ||
      characterClasses < 2
    )
      throw new HostedConfigurationError(
        "Public demo seeding requires a custom SEED_PASSWORD of 16–128 characters with at least eight distinct characters and two character types. The documented local demo password is not permitted. Set it privately before the first seed; existing account passwords are not reset.",
      );
  }
  return { prepareDatabase: true, seedDemo };
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function runScript(name: "migrate.ts" | "seed.ts"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(projectRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(projectRoot, "scripts", name),
      ],
      { cwd: projectRoot, env: process.env, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Database ${name} exited unsuccessfully.`));
    });
  });
}

export async function prepareHostedDatabase(): Promise<void> {
  // Validate everything, including the seed password, before opening a database
  // connection or running migrations. Invalid public defaults cannot mutate it.
  const plan = hostedPreparationPlan(process.env);
  if (!plan.prepareDatabase) {
    console.log(
      "Hosted database preparation skipped. Set PREPARE_DATABASE_ON_BUILD=true only after connecting the intended managed PostgreSQL database.",
    );
    return;
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  let inTransaction = false;
  try {
    await client.connect();
    // Keep overlapping preview/production build jobs from applying this schema
    // and sample seed concurrently. Do not reset or replace existing data.
    await client.query("BEGIN");
    inTransaction = true;
    // Transaction-scoped locks also work through transaction-pooling providers.
    await client.query("SELECT pg_advisory_xact_lock(174951521, 96)");
    await runScript("migrate.ts");
    if (plan.seedDemo) await runScript("seed.ts");
    await client.query("COMMIT");
    inTransaction = false;
    console.log(
      plan.seedDemo
        ? "Hosted schema and opt-in demo seed prepared. Existing user passwords and purchases were retained."
        : "Hosted schema prepared. Demo seeding is disabled.",
    );
  } finally {
    if (inTransaction) await client.query("ROLLBACK");
    await client.end();
  }
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    await prepareHostedDatabase();
  } catch (error) {
    // Connection URLs and seed passwords must never be echoed into build logs.
    console.error(
      error instanceof HostedConfigurationError
        ? error.message
        : "Hosted database preparation failed. Check database availability, credentials and the migration output, then retry the deployment.",
    );
    process.exitCode = 1;
  }
}
