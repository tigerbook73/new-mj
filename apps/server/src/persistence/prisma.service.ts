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
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
