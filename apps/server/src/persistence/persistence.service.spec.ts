import type { GameEvent } from "@new-mj/core";
import { PersistenceService } from "./persistence.service";
import { PrismaService } from "./prisma.service";

// Requires a real reachable Postgres at DATABASE_URL (`prisma migrate deploy`
// already applied) — skipped, not failed, when unset so `pnpm test` doesn't
// depend on Docker/a local Supabase being up. Run locally with e.g.
// `npx supabase start` (or a plain `docker run postgres`), then:
//   DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
//     pnpm --filter @new-mj/server test -- persistence.service.spec
const describeIfDb = process.env["DATABASE_URL"] ? describe : describe.skip;

describeIfDb("PersistenceService (real Postgres)", () => {
  let prisma: PrismaService;
  let service: PersistenceService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new PersistenceService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it("round-trips a game log, upserts idempotently, and reports missing games as null", async () => {
    const roomId = `spec-room-${Date.now()}`;
    await service.archiveGame(roomId, {
      gameNumber: 1,
      rulesetId: "junk",
      seatUserIds: ["u1", "u2", null, null],
      events: [{ type: "GameStarted", visibility: "public" } as unknown as GameEvent],
      finalState: { wall: [1, 2, 3], seats: [] },
    });
    // second archive of the same (roomId, gameNumber) must not throw —
    // handleGameEnd only ever calls this once per game in practice, but the
    // upsert shape itself should tolerate a retry.
    await service.archiveGame(roomId, {
      gameNumber: 1,
      rulesetId: "junk",
      seatUserIds: ["u1", "u2", null, null],
      events: [],
      finalState: {},
    });

    const found = await service.findGame(roomId, 1);
    expect(found?.rulesetId).toBe("junk");
    expect(found?.seatUserIds).toEqual(["u1", "u2", null, null]);

    expect(await service.findGame(roomId, 99)).toBeNull();
  });

  it("round-trips a session result", async () => {
    const roomId = `spec-room-${Date.now()}-session`;
    await service.archiveSession(roomId, {
      rulesetId: "junk",
      sessionFormat: "4-round",
      result: {
        winner: 0,
        ranking: [{ seatId: 0, score: 100 }],
        format: "4-round",
        gamesPlayed: 4,
      },
      finishedAt: Date.now(),
    });

    const found = await service.findSession(roomId);
    expect(found?.result.winner).toBe(0);
    expect(await service.findSession("no-such-room")).toBeNull();
  });

  it("upserts a profile", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    await service.upsertProfile(userId, "Alice");
    expect(await service.findProfile(userId)).toEqual({ nickname: "Alice", avatar: null });

    await service.upsertProfile(userId, "Alice B.", "https://example.com/a.png");
    expect(await service.findProfile(userId)).toEqual({
      nickname: "Alice B.",
      avatar: "https://example.com/a.png",
    });
  });
});
