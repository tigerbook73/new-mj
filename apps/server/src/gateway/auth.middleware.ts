import type { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { ConfigService } from "../config/config.service";
import type { PersistenceService } from "../persistence/persistence.service";
import type { SessionRegistry } from "./session-registry";

interface HandshakeAuth {
  token?: unknown;
  protocolVersion?: unknown;
  takeover?: unknown;
}

export class WsAuthError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "VERSION_MISMATCH" | "SESSION_EXISTS") {
    super(code);
    this.name = "WsAuthError";
  }
}

export const deriveNickname = (user: User): string => {
  const meta = user.user_metadata;
  for (const key of ["user_name", "name", "full_name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return user.email?.split("@")[0] ?? "player";
};

export const deriveAvatar = (user: User): string | undefined => {
  const avatar = user.user_metadata["avatar_url"] ?? user.user_metadata["picture"];
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
  sessionRegistry?: SessionRegistry,
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
      socket.data.nickname = deriveNickname(data.user);
      socket.data.avatar = deriveAvatar(data.user);
      persistenceService.fireAndForget(
        persistenceService.upsertProfile(
          data.user.id,
          deriveNickname(data.user),
          deriveAvatar(data.user),
        ),
        `upsertProfile(${data.user.id})`,
      );
      if (
        sessionRegistry &&
        !registerSession(socket, data.user.id, auth.takeover === true, sessionRegistry, next)
      )
        return;
      next();
      return;
    }

    try {
      const payload = jwtService.verify<{ sub: string }>(auth.token, {
        secret: configService.jwtSecret,
      });
      socket.data.userId = payload.sub;
      socket.data.nickname = defaultNickname(payload.sub);
      if (
        sessionRegistry &&
        !registerSession(socket, payload.sub, auth.takeover === true, sessionRegistry, next)
      )
        return;
      next();
    } catch {
      next(new WsAuthError("UNAUTHORIZED"));
    }
  };
};

const defaultNickname = (userId: string): string =>
  userId
    .replace(/-[a-z0-9]{6}$/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ") || "User";

const registerSession = (
  socket: Socket,
  userId: string,
  takeover: boolean,
  registry: SessionRegistry,
  next: (err?: Error) => void,
): boolean => {
  const existing = registry.get(userId);
  if (existing && existing !== socket) {
    if (!takeover) {
      next(new WsAuthError("SESSION_EXISTS"));
      return false;
    }
    existing.emit("session:kicked", { reason: "takeover" });
    existing.disconnect(true);
  }
  registry.set(userId, socket);
  socket.once("disconnect", () => registry.deleteIfSame(userId, socket));
  return true;
};
