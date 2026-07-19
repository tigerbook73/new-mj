import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../persistence/prisma.service";

export interface HealthResponse {
  ok: boolean;
  uptime: number;
  database: {
    configured: boolean;
    ok: boolean;
  };
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const configured = Boolean(process.env["DATABASE_URL"]);
    if (!configured) {
      return {
        ok: false,
        uptime: process.uptime(),
        database: { configured: false, ok: false },
      };
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        ok: true,
        uptime: process.uptime(),
        database: { configured: true, ok: true },
      };
    } catch {
      return {
        ok: false,
        uptime: process.uptime(),
        database: { configured: true, ok: false },
      };
    }
  }
}
