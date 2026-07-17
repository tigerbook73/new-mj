import type { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { ConfigService } from "../config/config.service";
import type { PersistenceService } from "../persistence/persistence.service";

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

const deriveNickname = (user: User): string => {
  const metaName = user.user_metadata["full_name"] ?? user.user_metadata["name"];
  if (typeof metaName === "string" && metaName.trim()) return metaName;
  return user.email?.split("@")[0] ?? "player";
};

const deriveAvatar = (user: User): string | undefined => {
  const avatar = user.user_metadata["avatar_url"];
  return typeof avatar === "string" ? avatar : undefined;
};

/**
 * docs/protocol.md §0 — rejects the connection outright (Socket.IO handshake
 * middleware, before `connection` fires) rather than gating individual
 * messages, so an unauthenticated/stale client never gets a live socket.
 * D10/architecture rule 3: socket.data.userId is the only source of
 * identity from here on; later messages must never trust a payload userId.
 *
 * Phase 5: two verification paths, chosen by whether real Supabase config
 * is present — not a separate test-mode flag. An environment without
 * SUPABASE_URL/SUPABASE_SERVICE_KEY set (every e2e test, this sandbox by
 * default) keeps using the D16 dev JWT path unchanged, zero test changes
 * needed. Uses supabase.auth.getUser(token) — delegates verification to
 * Supabase's own servers rather than checking the JWT signature locally —
 * so this works the same whether the project signs with the legacy shared
 * HS256 secret or newer asymmetric per-project keys, without this code
 * needing to know which.
 */
export const createAuthMiddleware = (
  jwtService: JwtService,
  configService: ConfigService,
  persistenceService: PersistenceService,
) => {
  const supabaseUrl = configService.supabaseUrl;
  const supabaseServiceKey = configService.supabaseServiceKey;
  const supabase: SupabaseClient | undefined =
    supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : undefined;

  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    const auth = socket.handshake.auth as HandshakeAuth;
    if (auth.protocolVersion !== configService.protocolVersion) {
      next(new WsAuthError("VERSION_MISMATCH"));
      return;
    }
    if (typeof auth.token !== "string") {
      next(new WsAuthError("UNAUTHORIZED"));
      return;
    }

    if (supabase) {
      const { data, error } = await supabase.auth.getUser(auth.token);
      if (error || !data.user) {
        next(new WsAuthError("UNAUTHORIZED"));
        return;
      }
      socket.data.userId = data.user.id;
      persistenceService.fireAndForget(
        persistenceService.upsertProfile(
          data.user.id,
          deriveNickname(data.user),
          deriveAvatar(data.user),
        ),
        `upsertProfile(${data.user.id})`,
      );
      next();
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
};
