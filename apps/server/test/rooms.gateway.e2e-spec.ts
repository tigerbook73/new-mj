import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { Reply, RoomInfo, RoomSummary } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";

const once = <T>(socket: ClientSocket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe("RoomsGateway (e2e, socket.io-client)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
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
});
