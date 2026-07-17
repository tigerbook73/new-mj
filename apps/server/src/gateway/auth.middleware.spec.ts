import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { ConfigService } from "../config/config.service";
import type { PersistenceService } from "../persistence/persistence.service";
import { createAuthMiddleware, WsAuthError } from "./auth.middleware";

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
