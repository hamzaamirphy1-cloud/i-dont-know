import { scrypt, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db";
import { applicationOrigin, secureSessionCookie } from "./hosted";
const scryptAsync = promisify(scrypt);
export type User = {
  id: string;
  email: string;
  name: string;
  role: "buyer" | "builder" | "admin";
  disabled: boolean;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [, salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  const actual = Buffer.from(hex, "hex");
  return actual.length === key.length && timingSafeEqual(actual, key);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const cookieName = "vibe96_session";
export function sessionCookie(token: string, maxAge = 604800) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureSessionCookie() ? "; Secure" : ""}`;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [tokenHash(token), userId],
  );
  return token;
}
export function requestToken(req: Request) {
  const value = (req.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export async function currentUser(req: Request): Promise<User | null> {
  const token = requestToken(req);
  if (!token) return null;
  const { rows } = await query<User>(
    "SELECT u.id,u.email,u.name,u.role,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false",
    [tokenHash(token)],
  );
  return rows[0] || null;
}
export async function requireUser(req: Request, roles?: User["role"][]) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (roles && !roles.includes(user.role))
    throw new HttpError(
      403,
      "Your account does not have permission for this action.",
    );
  return user;
}
export function guardOrigin(req: Request) {
  let configured: string | undefined;
  try {
    configured = applicationOrigin();
  } catch {
    throw new HttpError(503, "The application origin is misconfigured.");
  }
  if (!configured) throw new HttpError(503, "APP_URL is not configured.");
  if (req.headers.get("origin") !== configured)
    throw new HttpError(403, "Request origin is not allowed.");
}
export async function limitAuth(email: string) {
  const key = tokenHash(email.toLowerCase());
  const { rows } = await query<{ attempts: number }>(
    `INSERT INTO auth_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.reset_at<now() THEN 1 ELSE auth_limits.attempts+1 END, reset_at=CASE WHEN auth_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE auth_limits.reset_at END RETURNING attempts`,
    [key],
  );
  if (rows[0].attempts > 15)
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
}
