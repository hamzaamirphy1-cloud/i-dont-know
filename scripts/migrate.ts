import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "../lib/db";
try {
  await pool().query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  console.log("Database migration complete.");
} finally {
  await pool().end();
}
