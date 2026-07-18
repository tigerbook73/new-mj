import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { playJunkGame, type SeatId } from "@new-mj/core";
import type { Reply, RoomInfo, SessionResult } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";
import { GameService } from "../src/core/game.service";
import { RoomService } from "../src/rooms/room.service";

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const once = <T>(socket: ClientSocket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

/**
 * docs/phase-2-server.md step 6: the RoomService-level test already proves
 * the orchestration logic against the real junk engine (using core's
 * playJunkGame to script a deterministic action log per seed). This test
 * reuses the same technique but drives every action through real
 * socket.io-client connections instead of calling RoomService directly, so
 * it actually exercises the wire protocol (ack/event framing, per-seat
 * game:snapshot unicast, room:scoreUpdated/dealerChanged/sessionFinished
 * broadcasts) across a full 4-round session, not just the connection setup
 * covered by rooms.gateway.e2e-spec.ts.
 */
describe("RoomsGateway (e2e) — full 4-round session over real sockets", () => {
  let app: INestApplication;
  let baseUrl = "";
  let roomService: RoomService;
  let jwtService: JwtService;
  let configService: ConfigService;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    roomService = app.get(RoomService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
  });

  const connectAs = (userId: string): Promise<ClientSocket> => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: {
        token: jwtService.sign({ sub: userId }, { secret: configService.jwtSecret }),
        protocolVersion: configService.protocolVersion,
        tabId: crypto.randomUUID(),
        browserId: crypto.randomUUID(),
      },
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once("connect", () => resolve(client));
      client.once("connect_error", reject);
    });
  };

  it("plays a full 4-round session end to end and reaches room:sessionFinished", async () => {
    const seatSockets = await Promise.all([
      connectAs("session-a"),
      connectAs("session-b"),
      connectAs("session-c"),
      connectAs("session-d"),
    ]);
    const [a, b, c, d] = seatSockets;

    const created = await ack<RoomInfo>(a!, "room:create", { rulesetId: "junk" });
    if (!created.ok) throw new Error(`room:create failed: ${created.code}`);
    const roomId = created.data.id;

    for (const client of [b!, c!, d!]) {
      const joined = await ack<RoomInfo>(client, "room:join", { roomId });
      if (!joined.ok) throw new Error(`room:join failed: ${joined.code}`);
    }

    for (const client of seatSockets) {
      const ready = await ack<object>(client!, "room:ready", { ready: true });
      if (!ready.ok) throw new Error(`room:ready failed: ${ready.code}`);
    }

    const sessionFinished = once<{ result: SessionResult }>(a!, "room:sessionFinished");
    const scoreUpdates: unknown[] = [];
    a!.on("room:scoreUpdated", (event: unknown) => scoreUpdates.push(event));

    const started = await ack<object>(a!, "room:start", {});
    if (!started.ok) throw new Error(`room:start failed: ${started.code}`);

    for (let round = 0; round < 4; round++) {
      const room = roomService.get(roomId);
      if (!room) throw new Error("room disappeared mid-session");
      expect(room.phase).toBe("in-game");

      const played = playJunkGame(room.seed, {}, [], room.dealer);
      if ("error" in played) throw new Error(`playJunkGame failed: ${played.error}`);

      for (const { seat, action } of played.actions) {
        const currentRoom = roomService.get(roomId);
        if (!currentRoom || currentRoom.phase !== "in-game") break;
        // seatSockets has exactly 4 entries (0-3), matching SeatId's range.
        const socket = seatSockets[seat as SeatId]!;
        const result = await ack<object>(socket, "game:action", { action });
        if (!result.ok)
          throw new Error(`game:action rejected: ${result.code} ${result.message ?? ""}`);
      }
    }

    const { result } = await sessionFinished;
    expect(result.gamesPlayed).toBe(4);
    expect(result.ranking).toHaveLength(4);
    expect(scoreUpdates.length).toBeGreaterThanOrEqual(4);

    const room = roomService.get(roomId);
    expect(room?.phase).toBe("finished");
    expect(room?.status).toBe("closed");
  }, 30000);

  /**
   * Phase 4.2 acceptance criterion, exercised over real sockets rather than
   * calling RoomService.handleDisconnect directly (already unit-tested in
   * room.service.spec.ts) — this proves RoomsGateway.handleDisconnect is
   * actually wired to the real Socket.IO `disconnect` lifecycle event.
   */
  it("continues and finishes the session after a seat disconnects mid-game", async () => {
    const gameService = new GameService();
    const seatSockets = await Promise.all([
      connectAs("disc-a"),
      connectAs("disc-b"),
      connectAs("disc-c"),
      connectAs("disc-d"),
    ]);
    const [a, b, c, d] = seatSockets;

    const created = await ack<RoomInfo>(a!, "room:create", { rulesetId: "junk" });
    if (!created.ok) throw new Error(`room:create failed: ${created.code}`);
    const roomId = created.data.id;

    for (const client of [b!, c!, d!]) {
      const joined = await ack<RoomInfo>(client, "room:join", { roomId });
      if (!joined.ok) throw new Error(`room:join failed: ${joined.code}`);
    }

    for (const client of seatSockets) {
      const ready = await ack<object>(client!, "room:ready", { ready: true });
      if (!ready.ok) throw new Error(`room:ready failed: ${ready.code}`);
    }

    const sessionFinished = once<{ result: SessionResult }>(a!, "room:sessionFinished");

    const started = await ack<object>(a!, "room:start", {});
    if (!started.ok) throw new Error(`room:start failed: ${started.code}`);

    // b joined second, so it's seated at 1 (create()/join() fill seats in
    // order). Disconnecting it should reach RoomsGateway.handleDisconnect →
    // RoomService.handleDisconnect and mark that seat auto-piloted.
    b!.disconnect();
    // Disconnect enters the 60-second grace period; advance past it before
    // asserting the irreversible handoff to AI.
    await new Promise((resolve) => setTimeout(resolve, 60_100));
    expect(roomService.get(roomId)?.players[1]).toMatchObject({ isAutoPiloted: true });

    // Drive only the 3 still-connected seats interactively (fresh
    // getLegalActions() each step, first option) — seat 1's turns are
    // handled entirely server-side by autoPlayBots, no socket 1 traffic.
    const connectedSeats = [0, 2, 3] as const;
    let steps = 0;
    while (steps++ < 2000) {
      const room = roomService.get(roomId);
      if (!room || room.phase !== "in-game") break;
      const seat = connectedSeats.find(
        (candidate) => gameService.getLegalActions(room.gameState, candidate).length > 0,
      );
      if (seat === undefined) throw new Error("no connected seat has a legal action — stuck?");
      const legalActions = gameService.getLegalActions(room.gameState, seat);
      const result = await ack<object>(seatSockets[seat]!, "game:action", {
        action: legalActions[0],
      });
      if (!result.ok)
        throw new Error(`game:action rejected: ${result.code} ${result.message ?? ""}`);
    }

    const { result } = await sessionFinished;
    expect(result.gamesPlayed).toBe(4);

    const room = roomService.get(roomId);
    expect(room?.phase).toBe("finished");
    expect(room?.status).toBe("closed");
  }, 90_000);
});
