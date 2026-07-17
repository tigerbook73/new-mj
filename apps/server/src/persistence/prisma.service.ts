import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Standard Nest+Prisma lifecycle wiring — connect/disconnect follow the
 * module's own lifecycle. Prisma 7 dropped `datasource.url` from
 * schema.prisma; the running client's connection is a driver adapter
 * instead (https://pris.ly/d/prisma7-client-config) — Migrate's own
 * connection is separately configured in prisma.config.ts.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }) });
  }

  async onModuleInit(): Promise<void> {
    // No DATABASE_URL (dev/test/CI without a local Postgres running) is a
    // valid, degraded mode — RoomService only ever touches this through
    // fire-and-forget calls (decisions.md phase 5 entry) or DB-fallback
    // reads that already handle "not found", so skipping the eager
    // connection here just means those calls fail lazily and quietly
    // instead of blocking every app bootstrap on a DB that isn't there.
    if (!process.env["DATABASE_URL"]) return;
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
