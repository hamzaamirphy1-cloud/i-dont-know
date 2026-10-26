type Environment = Record<string, string | undefined>;
/** Use provider-owned system variables, never an untrusted request Host header. */
export function applicationOrigin(
  env: Environment = process.env,
): string | undefined {
  let configured = env.APP_URL?.trim();
  if (!configured && env.VERCEL === "1") {
    const host =
      env.VERCEL_ENV === "production"
        ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
        : env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL;
    if (host) {
      if (!/^[a-zA-Z0-9.-]+$/.test(host))
        throw Error("Invalid Vercel deployment hostname.");
      configured = "https://" + host;
    }
  }
  if (!configured) return undefined;
  const url = new URL(configured);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "APP_URL must be a plain HTTP(S) origin without credentials or paths.",
    );
  if (env.VERCEL === "1" && url.protocol !== "https:")
    throw Error("APP_URL must use HTTPS on Vercel.");
  return url.origin;
}
export function secureSessionCookie(env: Environment = process.env) {
  return env.VERCEL === "1" || env.COOKIE_SECURE === "true";
}
