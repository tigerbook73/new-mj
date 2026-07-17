import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { DebugOmniscientView, Reply, RoomInfo } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe("debug:omniscientView (e2e, socket.io-client — dev/test-only escape hatch, D19)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
  const clients: ClientSocket[] = [];
  const originalEnv = process.env["ALLOW_DEBUG_OMNISCIENT"];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const configService = app.get(ConfigService);
    const jwtService = app.get(JwtService);
    protocolVersion = configService.protocolVersion;
    makeToken = (userId: string) =>
      jwtService.sign({ sub: userId }, { secret: configService.jwtSecret });
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
    if (originalEnv === undefined) delete process.env["ALLOW_DEBUG_OMNISCIENT"];
    else process.env["ALLOW_DEBUG_OMNISCIENT"] = originalEnv;
  });

  afterEach(() => {
    delete process.env["ALLOW_DEBUG_OMNISCIENT"];
  });

  const connectAs = (userId: string): Promise<ClientSocket> => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: { token: makeToken(userId), protocolVersion },
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once("connect", () => resolve(client));
      client.once("connect_error", reject);
    });
  };

  it("rejects the request when ALLOW_DEBUG_OMNISCIENT is unset (default)", async () => {
    const client = await connectAs("debug-flag-off-user");
    const result = await ack<DebugOmniscientView>(client, "debug:omniscientView", {});
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects a socket that never joined any room, even with the flag on", async () => {
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    const client = await connectAs("debug-lonely-user");
    const result = await ack<DebugOmniscientView>(client, "debug:omniscientView", {});
    expect(result).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
  });

  it("rejects when the game hasn't started yet", async () => {
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    const host = await connectAs("debug-waiting-host");
    const created = await ack<RoomInfo>(host, "room:create", { rulesetId: "junk" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await ack<DebugOmniscientView>(host, "debug:omniscientView", {});
    expect(result).toMatchObject({ ok: false, code: "GAME_NOT_STARTED" });
  });

  it("returns the wall and all four hands, conserving the full junk tile set", async () => {
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    const [a, b, c, d] = await Promise.all([
      connectAs("debug-seat-a"),
      connectAs("debug-seat-b"),
      connectAs("debug-seat-c"),
      connectAs("debug-seat-d"),
    ]);

    const created = await ack<RoomInfo>(a, "room:create", { rulesetId: "junk" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const roomId = created.data.id;

    for (const client of [b, c, d]) {
      expect((await ack<RoomInfo>(client, "room:join", { roomId })).ok).toBe(true);
    }
    for (const client of [a, b, c, d]) {
      expect((await ack<object>(client, "room:ready", { ready: true })).ok).toBe(true);
    }
    expect(await ack<object>(a, "room:start", {})).toEqual({ ok: true, data: {} });

    const result = await ack<DebugOmniscientView>(a, "debug:omniscientView", {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.hands).toHaveLength(4);
    const allIds = [...result.data.wall, ...result.data.hands.flat()];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBe(136);
  });
});
