import { Injectable } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@new-mj/protocol";

@Injectable()
export class ConfigService {
  readonly protocolVersion = PROTOCOL_VERSION;

  /**
   * MVP: a shared HS256 secret, not Supabase's actual JWKS/verification
   * mechanism (D3 — Supabase wiring is phase 4). PORT/JWT_SECRET read from
   * env with dev-only fallbacks so `nest start` works out of the box;
   * production deployments must set real values.
   */
  get jwtSecret(): string {
    return process.env["JWT_SECRET"] ?? "dev-only-insecure-secret";
  }

  get port(): number {
    const raw = process.env["PORT"];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) ? parsed : 3000;
  }
}
