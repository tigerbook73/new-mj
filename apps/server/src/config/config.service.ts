import { Injectable } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@new-mj/protocol";

@Injectable()
export class ConfigService {
  readonly protocolVersion = PROTOCOL_VERSION;

  /**
   * Dev-only fallback secret (D16) — real Supabase verification uses
   * supabaseUrl/supabaseServiceKey below. Production deployments must set
   * a real JWT_SECRET.
   */
  get jwtSecret(): string {
    // `||` not `??`: an empty-value `JWT_SECRET=` line in an env file must
    // fall back too, same as the unset case (matches supabaseUrl/
    // supabaseServiceKey's falsy checks below).
    return process.env["JWT_SECRET"] || "dev-only-insecure-secret";
  }

  get port(): number {
    const raw = process.env["PORT"];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) ? parsed : 3000;
  }

  /**
   * Dev/test-only escape hatch (decisions.md D19, protocol-shared.md §7):
   * gates the `debug:omniscientView` channel. Defaults off — must be
   * explicitly opted into, never set in a shipped deployment.
   */
  get allowDebugOmniscient(): boolean {
    return process.env["ALLOW_DEBUG_OMNISCIENT"] === "true";
  }

  /**
   * Phase 5 real Supabase Auth. Deliberately `undefined` (not a dev-only
   * fallback like jwtSecret above) when unset — auth.middleware.ts uses
   * their presence, not a separate flag, to decide whether to verify
   * against real Supabase or fall back to the JWT_SECRET dev path; a fake
   * default here would silently defeat that branch.
   */
  get supabaseUrl(): string | undefined {
    return process.env["SUPABASE_URL"];
  }

  get supabaseServiceKey(): string | undefined {
    return process.env["SUPABASE_SERVICE_KEY"];
  }

  /**
   * D16 fallback gate: when Supabase is configured but a token fails its
   * verification, auth.middleware.ts retries the D16 dev JWT path only when
   * this is false — so a leaked/default dev secret can never bypass a real
   * deployment's auth, regardless of what SUPABASE_URL happens to be set to.
   */
  get isProduction(): boolean {
    return process.env["NODE_ENV"] === "production";
  }

  /**
   * Mid-game disconnect grace period (session-mechanics.md 评审点 H) before a
   * seat is permanently handed to autoPlayBots. Overridable so e2e tests
   * don't have to burn real wall-clock time waiting out the production
   * 60-second default.
   */
  get disconnectGraceMs(): number {
    const raw = process.env["DISCONNECT_GRACE_MS"];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 60_000;
  }
}
