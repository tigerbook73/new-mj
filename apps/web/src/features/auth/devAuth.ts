import { SignJWT } from "jose";

/**
 * Dev-only fake login (D16) — signs with the same fallback secret
 * apps/server's ConfigService.jwtSecret uses when JWT_SECRET is unset.
 */
const DEV_JWT_SECRET = import.meta.env["VITE_DEV_JWT_SECRET"] ?? "dev-only-insecure-secret";

/**
 * Deterministic ids make a nickname a stateful local pseudo-account.
 */
export function deriveUserId(nickname: string): string {
  const slug =
    nickname
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "player";
  return `dev:${slug}`;
}

export async function signDevToken(userId: string): Promise<string> {
  const key = new TextEncoder().encode(DEV_JWT_SECRET);
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).sign(key);
}

const DEV_SESSION_KEY = "new-mj:dev-session";

export interface DevSession {
  token: string;
  nickname: string;
}

/** Single home for the dev-session localStorage key/shape — every reader/writer goes through these three. */
export function readDevSession(): DevSession | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(DEV_SESSION_KEY) ?? "null") as DevSession | null;
    return saved?.token ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function writeDevSession(session: DevSession): void {
  localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
}

export function clearDevSession(): void {
  localStorage.removeItem(DEV_SESSION_KEY);
}
