import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { DebugOmniscientView, Reply, RoomInfo } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";
import { GameService } from "../src/core/game.service";
import { RoomService } from "../src/rooms/room.service";

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe("debug:replayOmniscientView (e2e, socket.io-client — phase 4.5 step 5)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let roomService: RoomService;
  let gameService: GameService;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
  const clients: ClientSocket[] = [];
  const originalEnv = process.env["ALLOW_DEBUG_OMNISCIENT"];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    roomService = app.get(RoomService);
    gameService = app.get(GameService);

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

  /** Same technique as replay-get.e2e-spec.ts: re-read legal actions from live
   * server state each step (bots decide their own moves via @new-mj/ai). */
  const playOneFinishedGame = async (
    hostUserId: string,
  ): Promise<{ roomId: string; host: ClientSocket }> => {
    const host = await connectAs(hostUserId);
    const created = await ack<RoomInfo>(host, "room:create", { rulesetId: "junk" });
    if (!created.ok) throw new Error(`room:create failed: ${created.code}`);
    const roomId = created.data.id;

    for (let i = 0; i < 3; i++) {
      const added = await ack<object>(host, "room:addBot", {});
      if (!added.ok) throw new Error(`room:addBot failed: ${added.code}`);
    }
    const ready = await ack<object>(host, "room:ready", { ready: true });
    if (!ready.ok) throw new Error(`room:ready failed: ${ready.code}`);
    const started = await ack<object>(host, "room:start", {});
    if (!started.ok) throw new Error(`room:start failed: ${started.code}`);

    let steps = 0;
    while (steps < 500) {
      steps += 1;
      const room = roomService.get(roomId);
      if (!room) throw new Error("room disappeared mid-session");
      if (room.finishedGames.length >= 1 || room.phase !== "in-game") break;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      if (legalActions.length === 0) continue;
      const result = await ack<object>(host, "game:action", { action: legalActions[0] });
      if (!result.ok) throw new Error(`game:action rejected: ${result.code}`);
    }
    const finalRoom = roomService.get(roomId);
    if (!finalRoom || finalRoom.finishedGames.length < 1) {
      throw new Error("game never finished within the step budget");
    }
    return { roomId, host };
  };

  it("rejects the request when ALLOW_DEBUG_OMNISCIENT is unset (default)", async () => {
    const { host } = await playOneFinishedGame("replay-omni-flag-off");
    const result = await ack<DebugOmniscientView>(host, "debug:replayOmniscientView", {
      gameNumber: 1,
    });
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("rejects a gameNumber the room never archived, even with the flag on", async () => {
    const { host } = await playOneFinishedGame("replay-omni-missing-game");
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    const result = await ack<DebugOmniscientView>(host, "debug:replayOmniscientView", {
      gameNumber: 99,
    });
    expect(result).toMatchObject({ ok: false, code: "GAME_NOT_FOUND" });
  });

  it("returns all four hands + wall for a finished game, conserving the tile set", async () => {
    const { host } = await playOneFinishedGame("replay-omni-host");
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";

    const result = await ack<DebugOmniscientView>(host, "debug:replayOmniscientView", {
      gameNumber: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.hands).toHaveLength(4);
    const allIds = [...result.data.wall, ...result.data.hands.flat()];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBeGreaterThan(0);
    expect(allIds.length).toBeLessThanOrEqual(136);
  });
});
