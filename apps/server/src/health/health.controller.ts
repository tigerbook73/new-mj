import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): { ok: true; uptime: number } {
    return { ok: true, uptime: process.uptime() };
  }
}
