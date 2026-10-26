// Local development only. This script never removes a container or database volume.
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
try {
  process.loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const url = new URL(
  process.env.DATABASE_URL ||
    "postgresql://vibe96:vibe96_local_only@127.0.0.1:5432/vibe96",
);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.username !== "vibe96" ||
  decodeURIComponent(url.password) !== "vibe96_local_only" ||
  url.pathname !== "/vibe96"
) {
  console.log(
    "Using a custom DATABASE_URL. Manage its PostgreSQL server separately; no local container was changed.",
  );
  process.exit(0);
}
const name = "vibe96-postgres";
try {
  execFileSync("docker", ["info"], { stdio: "ignore" });
} catch {
  console.error(
    "Docker is not available. Start Docker Desktop, or configure DATABASE_URL for your PostgreSQL server.",
  );
  process.exit(1);
}
let exists = true;
try {
  execFileSync("docker", ["inspect", name], { stdio: "ignore" });
} catch {
  exists = false;
}
if (exists) execFileSync("docker", ["start", name], { stdio: "inherit" });
else
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_USER=vibe96",
      "-e",
      "POSTGRES_PASSWORD=vibe96_local_only",
      "-e",
      "POSTGRES_DB=vibe96",
      "-p",
      "127.0.0.1:5432:5432",
      "-v",
      "vibe96-postgres-data:/var/lib/postgresql/data",
      "postgres:17-alpine",
    ],
    { stdio: "inherit" },
  );
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    execFileSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "vibe96", "-d", "vibe96"],
      { stdio: "ignore" },
    );
    ready = true;
    break;
  } catch {
    await setTimeout(500);
  }
}
if (!ready) {
  console.error(
    "PostgreSQL did not become ready. Inspect: docker logs vibe96-postgres",
  );
  process.exit(1);
}
console.log("Local PostgreSQL is ready. Existing data was retained.");
