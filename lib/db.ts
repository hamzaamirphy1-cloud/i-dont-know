import pg from "pg";
const globalDb = globalThis as unknown as { vibePool?: pg.Pool };
export function pool() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and start PostgreSQL.",
    );
  if (!globalDb.vibePool)
    globalDb.vibePool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL === "1" ? 3 : 10,
      connectionTimeoutMillis: 5000,
    });
  return globalDb.vibePool;
}
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return pool().query<T>(text, values);
}
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
