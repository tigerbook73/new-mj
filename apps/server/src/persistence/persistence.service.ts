import { Injectable, Logger } from "@nestjs/common";
import type { GameEvent } from "@new-mj/core";
import type { SessionFormat, SessionResult } from "@new-mj/protocol";
import type { Prisma } from "@prisma/client";
import type { FinishedGameLog } from "../rooms/room";
import { PrismaService } from "./prisma.service";

export interface ArchivedGame extends FinishedGameLog {
  rulesetId: string;
}

export interface ArchivedSession {
  rulesetId: string;
  sessionFormat: SessionFormat;
  result: SessionResult;
  finishedAt: number;
}

/**
 * Persists the three phase-5 tables (profiles/room_sessions/game_logs, see
 * prisma/schema.prisma). Callers on the write side treat this as
 * fire-and-forget (RoomService never awaits archiveGame/archiveSession
 * inside its synchronous game-processing flow — decisions.md phase 5 entry,
 * "写入路径 fire-and-forget"). Json columns round-trip data this service
 * itself wrote, so read-side casts trust that shape rather than re-validating.
 */
@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);
  // No DATABASE_URL (dev/test/CI without a local Postgres running) short-
  // circuits every method to a fast no-op/null instead of letting Prisma
  // attempt a real connection — an unreachable host doesn't fail fast in
  // every sandbox (some silently hang on the TCP handshake instead of an
  // immediate ECONNREFUSED), which would otherwise hang fire-and-forget
  // writes and any test that plays a game through to completion.
  private readonly enabled = Boolean(process.env["DATABASE_URL"]);

  constructor(private readonly prisma: PrismaService) {}

  async archiveGame(roomId: string, game: ArchivedGame): Promise<void> {
    if (!this.enabled) return;
    await this.prisma.gameLog.upsert({
      where: { roomId_gameNumber: { roomId, gameNumber: game.gameNumber } },
      create: {
        roomId,
        gameNumber: game.gameNumber,
        rulesetId: game.rulesetId,
        seatUserIds: game.seatUserIds as unknown as Prisma.InputJsonValue,
        events: game.events as unknown as Prisma.InputJsonValue,
        finalState: game.finalState as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  async findGame(roomId: string, gameNumber: number): Promise<ArchivedGame | null> {
    if (!this.enabled) return null;
    const row = await this.prisma.gameLog.findUnique({
      where: { roomId_gameNumber: { roomId, gameNumber } },
    });
    if (!row) return null;
    return {
      gameNumber: row.gameNumber,
      rulesetId: row.rulesetId,
      seatUserIds: row.seatUserIds as FinishedGameLog["seatUserIds"],
      events: row.events as GameEvent[],
      finalState: row.finalState,
    };
  }

  async archiveSession(roomId: string, session: ArchivedSession): Promise<void> {
    if (!this.enabled) return;
    await this.prisma.roomSession.upsert({
      where: { id: roomId },
      create: {
        id: roomId,
        rulesetId: session.rulesetId,
        sessionFormat: session.sessionFormat,
        result: session.result as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(session.finishedAt),
      },
      update: {},
    });
  }

  async findSession(roomId: string): Promise<ArchivedSession | null> {
    if (!this.enabled) return null;
    const row = await this.prisma.roomSession.findUnique({ where: { id: roomId } });
    if (!row) return null;
    return {
      rulesetId: row.rulesetId,
      sessionFormat: row.sessionFormat as SessionFormat,
      result: row.result as unknown as SessionResult,
      finishedAt: row.finishedAt.getTime(),
    };
  }

  async upsertProfile(userId: string, nickname: string, avatar?: string): Promise<void> {
    if (!this.enabled) return;
    const avatarValue = avatar ?? null;
    await this.prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId, nickname, avatar: avatarValue },
      update: { nickname, avatar: avatarValue },
    });
  }

  async findProfile(userId: string): Promise<{ nickname: string; avatar: string | null } | null> {
    if (!this.enabled) return null;
    const row = await this.prisma.profile.findUnique({ where: { id: userId } });
    if (!row) return null;
    return { nickname: row.nickname, avatar: row.avatar };
  }

  /** Best-effort archival — never let a persistence failure interrupt the caller's sync flow. */
  fireAndForget(promise: Promise<void>, context: string): void {
    promise.catch((error: unknown) => {
      this.logger.error(`${context} failed`, error instanceof Error ? error.stack : error);
    });
  }
}
