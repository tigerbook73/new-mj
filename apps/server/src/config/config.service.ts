import { Injectable } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@new-mj/protocol";

@Injectable()
export class ConfigService {
  readonly protocolVersion = PROTOCOL_VERSION;

  /**
   * MVP: a shared HS256 secret, not Supabase's actual JWKS/verification
   * mechanism (D16 — real Supabase wiring is phase 5, see supabaseUrl/
   * supabaseServiceKey below). PORT/JWT_SECRET read from env with dev-only
   * fallbacks so `nest start` works out of the box; production deployments
   * must set real values.
   */
  get jwtSecret(): string {
    return process.env["JWT_SECRET"] ?? "dev-only-insecure-secret";
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
}
