import { config as loadEnv } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";

// Loads the repo-root .env into process.env before anything reads it
// (ConfigService, PrismaService's DATABASE_URL, etc.) — no other part of
// the repo needs this (Vite auto-loads .env natively; the Prisma CLI has
// its own loading via prisma.config.ts). Resolved from __dirname (always
// apps/server/dist at runtime, both dev and prod — see nest-cli.json's flat
// outDir) rather than process.cwd(), so this works the same whether
// launched via `nest start`, `pnpm --filter`, or Turbo from the repo root.
loadEnv({ path: resolve(__dirname, "../../.env") });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  await app.listen(configService.port);
}
bootstrap();
