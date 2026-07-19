import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { Reply, RoomInfo, RoomSummary, SessionIdentity } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";
import { GameService } from "../src/core/game.service";
import { RoomService } from "../src/rooms/room.service";

const once = <T>(socket: ClientSocket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe("RoomsGateway (e2e, socket.io-client)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
  let roomService: RoomService;
  const clients: ClientSocket[] = [];

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
    roomService = app.get(RoomService);
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
  });

  const connectAs = (userId: string): Promise<ClientSocket> => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: {
        token: makeToken(userId),
        protocolVersion,
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

  it("rejects a connection with a stale protocolVersion", async () => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: { token: makeToken("bad-version-user"), protocolVersion: "0.0" },
    });
    clients.push(client);

    const error = await new Promise<Error>((resolve) => client.once("connect_error", resolve));
    expect(error.message).toBe("VERSION_MISMATCH");
  });

  it("rejects a connection with no token", async () => {
    const client = io(baseUrl, {
      transports: ["websocket"],
      auth: { protocolVersion },
    });
    clients.push(client);

    const error = await new Promise<Error>((resolve) => client.once("connect_error", resolve));
    expect(error.message).toBe("UNAUTHORIZED");
  });

  it("plays create → join×3 → ready×4 → start → one action end to end", async () => {
    const [a, b, c, d] = await Promise.all([
      connectAs("user-a"),
      connectAs("user-b"),
      connectAs("user-c"),
      connectAs("user-d"),
    ]);

    const created = await ack<RoomInfo>(a, "room:create", { rulesetId: "junk" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const roomId = created.data.id;
    expect(created.data.phase).toBe("waiting");

    const bJoinedBroadcast = once<{ seat: number }>(a, "room:playerJoined");
    const joinB = await ack<RoomInfo>(b, "room:join", { roomId });
    expect(joinB.ok).toBe(true);
    await expect(bJoinedBroadcast).resolves.toMatchObject({ seat: 1 });

    expect((await ack<RoomInfo>(c, "room:join", { roomId })).ok).toBe(true);
    expect((await ack<RoomInfo>(d, "room:join", { roomId })).ok).toBe(true);

    // room is full now; a distinct 5th user's join must be rejected
    const fifthUser = await connectAs("user-e");
    const fifth = await ack<RoomInfo>(fifthUser, "room:join", { roomId });
    expect(fifth).toMatchObject({ ok: false, code: "ROOM_FULL" });

    const snapshots = Promise.all([a, b, c, d].map((client) => once(client, "game:snapshot")));

    for (const client of [a, b, c, d]) {
      const result = await ack<object>(client, "room:ready", { ready: true });
      expect(result.ok).toBe(true);
    }

    const nonOwnerStart = await ack<object>(b, "room:start", {});
    expect(nonOwnerStart).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    const started = await ack<object>(a, "room:start", {});
    expect(started).toEqual({ ok: true, data: {} });

    const views = (await snapshots) as Array<{ view: { seat: number }; seq: number }>;
    expect(views.map((v) => v.view.seat).sort()).toEqual([0, 1, 2, 3]);

    // action from a seat that is not their turn must be rejected with ILLEGAL_ACTION
    // (game:action still requires a legal action; sending garbage is the simplest
    // deterministic way to exercise the reply-mapping path without knowing whose turn it is).
    const rejected = await ack<object>(a, "game:action", { action: { type: "not-a-real-action" } });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(["ILLEGAL_ACTION", "NOT_YOUR_TURN"]).toContain(rejected.code);
    }
  });

  it("rejects game:action from a socket that never joined a room", async () => {
    const lonely = await connectAs("user-lonely");
    const result = await ack<object>(lonely, "game:action", { action: {} });
    expect(result).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
  });

  it("lobby:list/room:peek/room:leave (phase 4.4.4) work end to end over real sockets", async () => {
    const host = await connectAs("lobby-host");
    const guest = await connectAs("lobby-guest");

    const created = await ack<RoomInfo>(host, "room:create", {
      rulesetId: "junk",
      name: "Alice's e2e room",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const roomId = created.data.id;
    expect(created.data.name).toBe("Alice's e2e room");

    const listed = await ack<RoomSummary[]>(guest, "lobby:list", {
      rulesetId: "junk",
      search: "alice",
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const listedRoom = listed.data.find((room) => room.id === roomId);
      expect(listedRoom).toMatchObject({
        creator: expect.any(String),
        createdAt: expect.any(Number),
      });
    }

    const peeked = await ack<RoomInfo>(guest, "room:peek", { roomId });
    expect(peeked).toMatchObject({ ok: true, data: { id: roomId, name: "Alice's e2e room" } });

    const guestJoined = once<{ seat: number }>(host, "room:playerJoined");
    const joined = await ack<RoomInfo>(guest, "room:join", { roomId, seat: 3 });
    expect(joined.ok).toBe(true);
    await expect(guestJoined).resolves.toMatchObject({ seat: 3 });

    const guestLeft = once<{ seat: number }>(host, "room:playerLeft");
    const left = await ack<object>(guest, "room:leave", {});
    expect(left).toEqual({ ok: true, data: {} });
    await expect(guestLeft).resolves.toMatchObject({ seat: 3 });

    // guest left cleanly — a fresh room:join with the same identity must work
    // again instead of hitting ALREADY_IN_ROOM (proves the gateway actually
    // untracked the connection, not just the RoomService-side seat).
    const rejoined = await ack<RoomInfo>(guest, "room:join", { roomId });
    expect(rejoined.ok).toBe(true);

    const hostClosed = once<{ reason: string }>(guest, "room:closed");
    const hostLeft = await ack<object>(host, "room:leave", {});
    expect(hostLeft).toEqual({ ok: true, data: {} });
    await expect(hostClosed).resolves.toEqual({ reason: "hostLeft" });

    const peekAfterClose = await ack<RoomInfo>(guest, "room:peek", { roomId });
    expect(peekAfterClose).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
  });

  it("room:enter exposes human members and broadcasts observer changes", async () => {
    const host = await connectAs("participant-host");
    const observer = await connectAs("participant-observer");

    const created = await ack<RoomInfo>(host, "room:create", { rulesetId: "junk" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = once<{
      participant: { userId: string; isSeated: boolean; isBot: boolean };
    }>(host, "room:participantJoined");
    const entered = await ack<RoomInfo>(observer, "room:enter", { roomId: created.data.id });
    expect(entered).toMatchObject({
      ok: true,
      data: {
        participants: expect.arrayContaining([
          expect.objectContaining({ userId: "participant-host", isSeated: true, isBot: false }),
          expect.objectContaining({
            userId: "participant-observer",
            isSeated: false,
            isBot: false,
          }),
        ]),
      },
    });
    await expect(joined).resolves.toMatchObject({
      participant: { userId: "participant-observer", isSeated: false, isBot: false },
    });

    const left = once<{ userId: string }>(host, "room:participantLeft");
    expect(await ack<object>(observer, "room:leave", {})).toEqual({ ok: true, data: {} });
    await expect(left).resolves.toEqual({ userId: "participant-observer" });
  });

  it("session:identity reports activeRoom only while the caller currently holds a seat", async () => {
    const client = await connectAs("identity-user");

    const before = await ack<SessionIdentity>(client, "session:identity", {});
    expect(before).toMatchObject({ ok: true, data: { userId: "identity-user" } });
    if (before.ok) expect(before.data.activeRoom).toBeUndefined();

    const created = await ack<RoomInfo>(client, "room:create", { rulesetId: "junk" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const after = await ack<SessionIdentity>(client, "session:identity", {});
    expect(after).toMatchObject({
      ok: true,
      data: { activeRoom: { roomId: created.data.id, phase: "waiting" } },
    });
  });

  it("room:enter rebinds a reconnecting seated player's per-seat socket (regression: a stale ConnectionRegistry entry silently swallows the next game:event unicast)", async () => {
    process.env["DISCONNECT_GRACE_MS"] = "2000";
    try {
      const seatSockets = await Promise.all([
        connectAs("rebind-a"),
        connectAs("rebind-b"),
        connectAs("rebind-c"),
        connectAs("rebind-d"),
      ]);
      const [a, b, c, d] = seatSockets;

      const created = await ack<RoomInfo>(a, "room:create", { rulesetId: "junk" });
      if (!created.ok) throw new Error(`room:create failed: ${created.code}`);
      const roomId = created.data.id;
      for (const client of [b, c, d]) {
        const joined = await ack<RoomInfo>(client, "room:join", { roomId });
        if (!joined.ok) throw new Error(`room:join failed: ${joined.code}`);
      }
      for (const client of seatSockets) {
        const ready = await ack<object>(client, "room:ready", { ready: true });
        if (!ready.ok) throw new Error(`room:ready failed: ${ready.code}`);
      }
      const started = await ack<object>(a, "room:start", {});
      if (!started.ok) throw new Error(`room:start failed: ${started.code}`);

      // b (seat 1) disconnects without room:leave — enters the grace period
      // (RoomService.handleDisconnect), same as a real network drop.
      b.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // A fresh connection, same identity, reconnects within the grace
      // window — the exact client restore path (connect() + room:enter).
      const bReconnected = await connectAs("rebind-b");
      const entered = await ack<RoomInfo | { room: RoomInfo; view?: unknown; seq?: number }>(
        bReconnected,
        "room:enter",
        { roomId },
      );
      expect(entered.ok).toBe(true);
      if (entered.ok) expect("view" in entered.data).toBe(true);

      // Drive a legal action from a still-connected seat (never seat 1 — a
      // merely-disconnected-but-not-yet-auto-piloted seat isn't bot-driven,
      // see RoomService.nextBotAction). The resulting game:event must reach
      // bReconnected: before the fix, room:enter only called
      // ConnectionRegistry.enter(), never track(), so seatSockets kept
      // pointing at the original (now fully disconnected) `b` and this
      // unicast/broadcast would silently go nowhere.
      const gameService = new GameService();
      const room = roomService.get(roomId)!;
      const otherSeat = ([0, 2, 3] as const).find(
        (seat) => gameService.getLegalActions(room.gameState, seat).length > 0,
      );
      if (otherSeat === undefined) throw new Error("no connected seat has a legal action");
      const legalActions = gameService.getLegalActions(room.gameState, otherSeat);
      const receivedByNewSocket = once(bReconnected, "game:event");
      const acted = await ack<object>(seatSockets[otherSeat], "game:action", {
        action: legalActions[0],
      });
      expect(acted.ok).toBe(true);
      await expect(receivedByNewSocket).resolves.toBeDefined();
    } finally {
      delete process.env["DISCONNECT_GRACE_MS"];
    }
  }, 15000);
});
