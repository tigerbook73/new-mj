import { JwtService } from "@nestjs/jwt";
import { createClient } from "@supabase/supabase-js";
import type { Socket } from "socket.io";
import { ConfigService } from "../config/config.service";
import type { PersistenceService } from "../persistence/persistence.service";
import { createAuthMiddleware, deriveAvatar, deriveNickname, WsAuthError } from "./auth.middleware";
import { SessionRegistry } from "./session-registry";

// Only the `getUser` shape used by auth.middleware.ts is mocked; the real
// module would make a network call, which the D16-fallback tests below
// need to control deterministically (success/failure/production gating).
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));

const jwtService = new JwtService();
const configService = new ConfigService();
// No SUPABASE_URL/SUPABASE_SERVICE_KEY set in this test process, so
// createAuthMiddleware takes the dev JWT path below and never touches
// this — a real PersistenceService (needing a DB) would be overkill.
const persistenceService = {} as PersistenceService;
const middleware = createAuthMiddleware(jwtService, configService, persistenceService);

const fakeSocket = (auth: Record<string, unknown>): Socket =>
  ({ handshake: { auth }, data: {} }) as unknown as Socket;

describe("createAuthMiddleware", () => {
  it("rejects a protocolVersion mismatch with VERSION_MISMATCH", async () => {
    const socket = fakeSocket({ token: "irrelevant", protocolVersion: "0.9" });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "VERSION_MISMATCH" }));
  });

  it("rejects a missing/invalid token with UNAUTHORIZED", async () => {
    const socket = fakeSocket({ protocolVersion: configService.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("rejects a token signed with the wrong secret", async () => {
    const badToken = jwtService.sign({ sub: "user-1" }, { secret: "wrong-secret" });
    const socket = fakeSocket({ token: badToken, protocolVersion: configService.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("accepts a valid token and binds socket.data.userId from its `sub` claim, ignoring any payload userId", async () => {
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });
    const socket = fakeSocket({ token, protocolVersion: configService.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("user-1");
  });
});

describe("WsAuthError", () => {
  it("carries the ErrCode as a typed field, not just in the message", () => {
    const error = new WsAuthError("VERSION_MISMATCH");
    expect(error.code).toBe("VERSION_MISMATCH");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("session arbitration (SessionRegistry wired in)", () => {
  const fakeSessionSocket = (id: string, auth: Record<string, unknown>): Socket =>
    ({
      id,
      handshake: { auth },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      once: jest.fn(),
    }) as unknown as Socket;

  const auth = (token: string, tabId: string, browserId: string, takeover?: boolean) => ({
    token,
    protocolVersion: configService.protocolVersion,
    tabId,
    browserId,
    ...(takeover ? { takeover: true } : {}),
  });

  it("rejects with UNAUTHORIZED when tabId/browserId are missing", async () => {
    const registry = new SessionRegistry();
    const withRegistry = createAuthMiddleware(
      jwtService,
      configService,
      persistenceService,
      registry,
    );
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });
    const socket = fakeSessionSocket("s1", {
      token,
      protocolVersion: configService.protocolVersion,
    });
    const next = jest.fn();

    await withRegistry(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("same tabId (refresh): silently replaces the old socket, no takeover flag needed", async () => {
    const registry = new SessionRegistry();
    const withRegistry = createAuthMiddleware(
      jwtService,
      configService,
      persistenceService,
      registry,
    );
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });

    const first = fakeSessionSocket("s1", auth(token, "tab-a", "browser-a"));
    await withRegistry(first, jest.fn());

    const second = fakeSessionSocket("s2", auth(token, "tab-a", "browser-a"));
    const next = jest.fn();
    await withRegistry(second, next);

    expect(next).toHaveBeenCalledWith();
    expect(first.emit).toHaveBeenCalledWith("session:kicked", { reason: "takeover" });
    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(registry.get("user-1")?.socket).toBe(second);
  });

  it("same browserId, different tabId: hard rejects with SESSION_EXISTS_SAME_BROWSER, never kicks", async () => {
    const registry = new SessionRegistry();
    const withRegistry = createAuthMiddleware(
      jwtService,
      configService,
      persistenceService,
      registry,
    );
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });

    const first = fakeSessionSocket("s1", auth(token, "tab-a", "browser-a"));
    await withRegistry(first, jest.fn());

    const second = fakeSessionSocket("s2", auth(token, "tab-b", "browser-a"));
    const next = jest.fn();
    await withRegistry(second, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SESSION_EXISTS_SAME_BROWSER" }),
    );
    expect(first.emit).not.toHaveBeenCalled();
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(registry.get("user-1")?.socket).toBe(first);

    // takeover:true has no effect on this branch — still hard rejected.
    const third = fakeSessionSocket("s3", auth(token, "tab-c", "browser-a", true));
    const next3 = jest.fn();
    await withRegistry(third, next3);
    expect(next3).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SESSION_EXISTS_SAME_BROWSER" }),
    );
  });

  it("different browserId: soft SESSION_EXISTS, rejected unless takeover:true is sent", async () => {
    const registry = new SessionRegistry();
    const withRegistry = createAuthMiddleware(
      jwtService,
      configService,
      persistenceService,
      registry,
    );
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });

    const first = fakeSessionSocket("s1", auth(token, "tab-a", "browser-a"));
    await withRegistry(first, jest.fn());

    const second = fakeSessionSocket("s2", auth(token, "tab-b", "browser-b"));
    const next = jest.fn();
    await withRegistry(second, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_EXISTS" }));
    expect(first.disconnect).not.toHaveBeenCalled();

    const retry = fakeSessionSocket("s2b", auth(token, "tab-b", "browser-b", true));
    const nextRetry = jest.fn();
    await withRegistry(retry, nextRetry);

    expect(nextRetry).toHaveBeenCalledWith();
    expect(first.emit).toHaveBeenCalledWith("session:kicked", { reason: "takeover" });
    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(registry.get("user-1")?.socket).toBe(retry);
  });

  it("no conflict: connects normally and registers the session", async () => {
    const registry = new SessionRegistry();
    const withRegistry = createAuthMiddleware(
      jwtService,
      configService,
      persistenceService,
      registry,
    );
    const token = jwtService.sign({ sub: "user-1" }, { secret: configService.jwtSecret });
    const socket = fakeSessionSocket("s1", auth(token, "tab-a", "browser-a"));
    const next = jest.fn();

    await withRegistry(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(registry.get("user-1")?.socket).toBe(socket);
  });
});

describe("D16 dev JWT fallback when Supabase is configured", () => {
  const getUser = jest.fn();
  const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "NODE_ENV"] as const;
  const savedEnv: Record<(typeof envKeys)[number], string | undefined> = {
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_KEY: undefined,
    NODE_ENV: undefined,
  };

  beforeEach(() => {
    for (const key of envKeys) savedEnv[key] = process.env[key];
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    process.env["SUPABASE_SERVICE_KEY"] = "service-key";
    delete process.env["NODE_ENV"];
    (createClient as jest.Mock).mockReturnValue({ auth: { getUser } });
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    getUser.mockReset();
  });

  const buildMiddleware = () => {
    const localConfig = new ConfigService();
    const localPersistence = {
      fireAndForget: jest.fn(),
      upsertProfile: jest.fn(),
    } as unknown as PersistenceService;
    return {
      middleware: createAuthMiddleware(jwtService, localConfig, localPersistence),
      config: localConfig,
      persistence: localPersistence,
    };
  };

  it("still authenticates via real Supabase when getUser succeeds", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "supabase-user", user_metadata: {}, email: "a@b.com" } },
      error: null,
    });
    const { middleware, config, persistence } = buildMiddleware();
    const socket = fakeSocket({ token: "supabase-token", protocolVersion: config.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("supabase-user");
    expect(persistence.fireAndForget).toHaveBeenCalled();
  });

  it("falls back to the D16 dev JWT outside production when Supabase verification fails", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    const { middleware, config } = buildMiddleware();
    const token = jwtService.sign({ sub: "dev-user" }, { secret: config.jwtSecret });
    const socket = fakeSocket({ token, protocolVersion: config.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("dev-user");
  });

  it("never falls back in production, even if Supabase verification fails", async () => {
    process.env["NODE_ENV"] = "production";
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    const { middleware, config } = buildMiddleware();
    const token = jwtService.sign({ sub: "dev-user" }, { secret: config.jwtSecret });
    const socket = fakeSocket({ token, protocolVersion: config.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("rejects with UNAUTHORIZED when both Supabase and the dev JWT fail", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    const { middleware, config } = buildMiddleware();
    const socket = fakeSocket({ token: "garbage", protocolVersion: config.protocolVersion });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});

describe("verified profile fallback", () => {
  const user = (metadata: Record<string, unknown>, email = "fallback@example.com") =>
    ({ user_metadata: metadata, email }) as never;

  it("prefers the GitHub user_name and falls back through name/full_name/email", () => {
    expect(deriveNickname(user({ user_name: "octocat", name: "Octo" }))).toBe("octocat");
    expect(deriveNickname(user({ name: "Google Name", full_name: "Full Name" }))).toBe(
      "Google Name",
    );
    expect(deriveNickname(user({ full_name: "Full Name" }))).toBe("Full Name");
    expect(deriveNickname(user({}))).toBe("fallback");
  });

  it("uses avatar_url first and Google picture as fallback", () => {
    expect(deriveAvatar(user({ avatar_url: "github-avatar", picture: "google-avatar" }))).toBe(
      "github-avatar",
    );
    expect(deriveAvatar(user({ picture: "google-avatar" }))).toBe("google-avatar");
    expect(deriveAvatar(user({}))).toBeUndefined();
  });
});
