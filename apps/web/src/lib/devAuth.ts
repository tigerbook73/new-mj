import { SignJWT } from "jose";

/**
 * Temporary: dev-only fake login (decisions.md D16). Signs a JWT client-side
 * with the same shared secret apps/server's ConfigService.jwtSecret falls
 * back to when JWT_SECRET is unset — mirrors the pattern apps/server's own
 * e2e tests already use (jwtService.sign({sub}, {secret})). Replace with
 * real Supabase OAuth once D16's trigger condition is met; nothing else in
 * this module should be treated as a template for real auth.
 */
const DEV_JWT_SECRET = import.meta.env["VITE_DEV_JWT_SECRET"] ?? "dev-only-insecure-secret";

/**
 * The protocol has no nickname field yet (same gap apps/server's
 * defaultNickname works around) — folding the nickname into userId is a
 * cheap way to make it show up somewhere recognizable until that's added.
 */
export function deriveUserId(nickname: string): string {
  const slug =
    nickname
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "player";
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function signDevToken(userId: string): Promise<string> {
  const key = new TextEncoder().encode(DEV_JWT_SECRET);
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).sign(key);
}
