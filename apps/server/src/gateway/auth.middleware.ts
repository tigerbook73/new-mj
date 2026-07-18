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
 * Handshake middleware, not a per-message guard (architecture rule 3):
 * rejects the connection outright before `connection` fires.
 * Two verification paths chosen by whether Supabase config is present —
 * see docs/contracts/session-mechanics.md §11.
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
