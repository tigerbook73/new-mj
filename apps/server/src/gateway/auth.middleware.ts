import type { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import type { ConfigService } from "../config/config.service";

interface HandshakeAuth {
  token?: unknown;
  protocolVersion?: unknown;
}

export class WsAuthError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "VERSION_MISMATCH") {
    super(code);
    this.name = "WsAuthError";
  }
}

/**
 * docs/protocol.md §0 — rejects the connection outright (Socket.IO handshake
 * middleware, before `connection` fires) rather than gating individual
 * messages, so an unauthenticated/stale client never gets a live socket.
 * D10/architecture rule 3: socket.data.userId is the only source of
 * identity from here on; later messages must never trust a payload userId.
 */
export const createAuthMiddleware =
  (jwtService: JwtService, configService: ConfigService) =>
  (socket: Socket, next: (err?: Error) => void): void => {
    const auth = socket.handshake.auth as HandshakeAuth;
    if (auth.protocolVersion !== configService.protocolVersion) {
      next(new WsAuthError("VERSION_MISMATCH"));
      return;
    }
    if (typeof auth.token !== "string") {
      next(new WsAuthError("UNAUTHORIZED"));
      return;
    }
    try {
      const payload = jwtService.verify<{ sub: string }>(auth.token, {
        secret: configService.jwtSecret,
      });
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new WsAuthError("UNAUTHORIZED"));
    }
  };
