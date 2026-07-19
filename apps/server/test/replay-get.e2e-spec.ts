import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { Reply, ReplayGetResponse, RoomInfo } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";
import { GameService } from "../src/core/game.service";
import { RoomService } from "../src/rooms/room.service";

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe("replay:get (e2e, socket.io-client — phase 4.5 step 3)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let roomService: RoomService;
  let gameService: GameService;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
  const clients: ClientSocket[] = [];

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
  });

  afterEach(() => {
    for (const client of clients) client.disconnect();
    clients.length = 0;
  });

  const connectAs = (userId: string, takeover = false): Promise<ClientSocket> => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: {
        token: makeToken(userId),
        protocolVersion,
        tabId: crypto.randomUUID(),
        browserId: crypto.randomUUID(),
        ...(takeover ? { takeover: true } : {}),
      },
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once("connect", () => resolve(client));
      client.once("connect_error", reject);
    });
  };

  /**
   * Host + 3 bots, driven only through seat 0's real socket — legal actions
   * are re-read from live server state each step (not a pre-computed
   * script) because bot seats decide their own moves via @new-mj/ai, so a
   * fixed action log would drift out of sync with what actually happened.
   */
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

  it("returns the requester's reconstructed view + filtered events for a game they played", async () => {
    const { roomId, host } = await playOneFinishedGame("replay-host");

    const result = await ack<ReplayGetResponse>(host, "replay:get", { roomId, gameNumber: 1 });

    expect(result).toMatchObject({
      ok: true,
      data: { gameNumber: 1, finalView: { seat: 0 } },
    });
    if (!result.ok) return;
    expect(result.data.events.length).toBeGreaterThan(0);
    expect(result.data.events[0]?.payload).toMatchObject({ type: "GameStarted" });
  });

  it("rejects an unknown gameNumber with GAME_NOT_FOUND", async () => {
    const { roomId, host } = await playOneFinishedGame("replay-missing-game");

    const result = await ack<ReplayGetResponse>(host, "replay:get", { roomId, gameNumber: 99 });
    expect(result).toMatchObject({ ok: false, code: "GAME_NOT_FOUND" });
  });

  it("rejects a userId who was never seated in that game with UNAUTHORIZED", async () => {
    const { roomId } = await playOneFinishedGame("replay-owner");
    const stranger = await connectAs("replay-stranger");

    const result = await ack<ReplayGetResponse>(stranger, "replay:get", { roomId, gameNumber: 1 });
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("works even for a requester who never joined this room's live connection registry", async () => {
    const { roomId, host } = await playOneFinishedGame("replay-registry-a");
    // A second socket for the same userId — proves replay:get doesn't rely
    // on the gateway's ConnectionRegistry (requireConnection/seatOf), only
    // on handshake identity + RoomService's own seatUserIds check.
    const sameUserSecondSocket = await connectAs("replay-registry-a", true);
    void host;

    const result = await ack<ReplayGetResponse>(sameUserSecondSocket, "replay:get", {
      roomId,
      gameNumber: 1,
    });
    expect(result).toMatchObject({ ok: true, data: { gameNumber: 1, finalView: { seat: 0 } } });
  });
});
