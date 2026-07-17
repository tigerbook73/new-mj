import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import type { GameEvent } from "@new-mj/core";
import type { Reply, ReplayGetResponse } from "@new-mj/protocol";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { ConfigService } from "../src/config/config.service";
import { PersistenceService } from "../src/persistence/persistence.service";

const ack = <T>(socket: ClientSocket, event: string, payload: unknown): Promise<Reply<T>> =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

// Requires a real reachable Postgres at DATABASE_URL (see
// persistence.service.spec.ts for how to run one locally) — skipped, not
// failed, when unset.
const describeIfDb = process.env["DATABASE_URL"] ? describe : describe.skip;

describeIfDb("replay:get DB fallback for a room not in memory (phase 5.3)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let persistenceService: PersistenceService;
  let makeToken: (userId: string) => string;
  let protocolVersion: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    persistenceService = app.get(PersistenceService);

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
      auth: { token: makeToken(userId), protocolVersion },
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once("connect", () => resolve(client));
      client.once("connect_error", reject);
    });
  };

  it("finds a game that only exists in PG — this simulates 'server restarted since this game finished', not a live room's in-memory finishedGames array", async () => {
    const roomId = `db-fallback-room-${Date.now()}`;
    await persistenceService.archiveGame(roomId, {
      gameNumber: 1,
      rulesetId: "junk",
      seatUserIds: ["restart-survivor", null, null, null],
      events: [
        {
          seq: 1,
          visibility: { type: "public" },
          payload: { type: "GameStarted", handCounts: [13, 13, 13, 13], wallCount: 84, dealer: 0 },
        },
      ] as unknown as GameEvent[],
      finalState: {},
    });

    const client = await connectAs("restart-survivor");
    const result = await ack<ReplayGetResponse>(client, "replay:get", { roomId, gameNumber: 1 });

    expect(result).toMatchObject({ ok: true, data: { gameNumber: 1, finalView: { seat: 0 } } });
  });

  it("still rejects a userId who wasn't in that archived game's seatUserIds", async () => {
    const roomId = `db-fallback-room-${Date.now()}-unauthorized`;
    await persistenceService.archiveGame(roomId, {
      gameNumber: 1,
      rulesetId: "junk",
      seatUserIds: ["owner", null, null, null],
      events: [],
      finalState: {},
    });

    const stranger = await connectAs("some-stranger");
    const result = await ack<ReplayGetResponse>(stranger, "replay:get", { roomId, gameNumber: 1 });
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("returns GAME_NOT_FOUND for a room that exists nowhere — neither memory nor PG", async () => {
    const client = await connectAs("nobody");
    const result = await ack<ReplayGetResponse>(client, "replay:get", {
      roomId: "totally-unknown-room",
      gameNumber: 1,
    });
    expect(result).toMatchObject({ ok: false, code: "GAME_NOT_FOUND" });
  });
});
