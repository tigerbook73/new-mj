import { Injectable } from "@nestjs/common";

/**
 * D7: protocol has no version negotiation, only a constant that tells the
 * client to refresh when it drifts from the server's.
 */
const PROTOCOL_VERSION = "1.0";

@Injectable()
export class ConfigService {
  readonly protocolVersion = PROTOCOL_VERSION;

  /**
   * MVP: a shared HS256 secret, not Supabase's actual JWKS/verification
   * mechanism (D3 — Supabase wiring is phase 4). SOCKET_PORT/JWT_SECRET
   * read from env with dev-only fallbacks so `nest start` works out of the
   * box; production deployments must set real values.
   */
  get jwtSecret(): string {
    return process.env["JWT_SECRET"] ?? "dev-only-insecure-secret";
  }

  get port(): number {
    const raw = process.env["SOCKET_PORT"];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) ? parsed : 3000;
  }
}
