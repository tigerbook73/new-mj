import type { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { ConfigService } from "../config/config.service";
import type { PersistenceService } from "../persistence/persistence.service";
import type { SessionRegistry } from "./session-registry";

interface HandshakeAuth {
  token?: unknown;
  protocolVersion?: unknown;
  tabId?: unknown;
  browserId?: unknown;
  takeover?: unknown;
}

export class WsAuthError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHORIZED"
      | "VERSION_MISMATCH"
      | "SESSION_EXISTS"
      | "SESSION_EXISTS_SAME_BROWSER",
  ) {
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
 * see docs/contracts/session-mechanics.md §11. When Supabase is configured
 * but a token fails its verification, falls back to the D16 dev JWT path,
 * but only outside production (`configService.isProduction`) — otherwise a
 * committed/default dev secret would let a forged token bypass real auth in
 * a shipped deployment.
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

  const verifyDevJwt = (token: string): string | undefined => {
    try {
      return jwtService.verify<{ sub: string }>(token, { secret: configService.jwtSecret }).sub;
    } catch {
      return undefined;
    }
  };

  const finish = (
    socket: Socket,
    userId: string,
    nickname: string,
    avatar: string | undefined,
    takeover: boolean,
    tabId: string | undefined,
    browserId: string | undefined,
    next: (err?: Error) => void,
  ): void => {
    socket.data.userId = userId;
    socket.data.nickname = nickname;
    socket.data.avatar = avatar;
    if (sessionRegistry) {
      // tabId/browserId are only mandatory once a SessionRegistry is wired in
      // (i.e. real deployments via RoomsGateway) — unit tests that construct
      // this middleware without one don't need to care about session
      // arbitration at all.
      if (!tabId || !browserId) {
        next(new WsAuthError("UNAUTHORIZED"));
        return;
      }
      if (!registerSession(socket, userId, tabId, browserId, takeover, sessionRegistry, next)) return;
    }
    next();
  };

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
    const token = auth.token;
    const takeover = auth.takeover === true;
    const tabId = typeof auth.tabId === "string" ? auth.tabId : undefined;
    const browserId = typeof auth.browserId === "string" ? auth.browserId : undefined;

    if (supabase) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        persistenceService.fireAndForget(
          persistenceService.upsertProfile(
            data.user.id,
            deriveNickname(data.user),
            deriveAvatar(data.user),
          ),
          `upsertProfile(${data.user.id})`,
        );
        finish(
          socket,
          data.user.id,
          deriveNickname(data.user),
          deriveAvatar(data.user),
          takeover,
          tabId,
          browserId,
          next,
        );
        return;
      }

      if (!configService.isProduction) {
        const sub = verifyDevJwt(token);
        if (sub) {
          finish(socket, sub, defaultNickname(sub), undefined, takeover, tabId, browserId, next);
          return;
        }
      }

      next(new WsAuthError("UNAUTHORIZED"));
      return;
    }

    const sub = verifyDevJwt(token);
    if (!sub) {
      next(new WsAuthError("UNAUTHORIZED"));
      return;
    }
    finish(socket, sub, defaultNickname(sub), undefined, takeover, tabId, browserId, next);
  };
};

const defaultNickname = (userId: string): string =>
  userId
    .replace(/-[a-z0-9]{6}$/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ") || "User";

/**
 * Session arbitration (session-mechanics.md "账号级并发连接约束"): compares
 * the connecting client's tab/browser identity against the currently
 * registered one for this userId.
 * - same tabId (typical: refresh) → unconditional silent replace, first
 *   handshake succeeds without needing `takeover`.
 * - different tabId, same browserId (a sibling tab in the same browser,
 *   still connected) → hard reject, `takeover` has no effect — the client
 *   routes to a dead-end "close this tab" page, never a confirm prompt.
 * - different browserId → today's soft `SESSION_EXISTS`: rejected unless
 *   `takeover:true`, which the client only sends after an explicit confirm.
 */
const registerSession = (
  socket: Socket,
  userId: string,
  tabId: string,
  browserId: string,
  takeover: boolean,
  registry: SessionRegistry,
  next: (err?: Error) => void,
): boolean => {
  const existing = registry.get(userId);
  if (existing && existing.socket !== socket) {
    if (existing.tabId !== tabId) {
      if (existing.browserId === browserId) {
        next(new WsAuthError("SESSION_EXISTS_SAME_BROWSER"));
        return false;
      }
      if (!takeover) {
        next(new WsAuthError("SESSION_EXISTS"));
        return false;
      }
    }
    existing.socket.emit("session:kicked", { reason: "takeover" });
    existing.socket.disconnect(true);
  }
  registry.set(userId, { socket, tabId, browserId });
  socket.once("disconnect", () => registry.deleteIfSame(userId, socket));
  return true;
};
