import { findRootSync } from "@manypkg/find-root";
import { config as loadEnv } from "dotenv-flow";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";

// Loads repo-root .env* into process.env before anything reads it (root found via find-root, not hand-counted `..`; prisma.config.ts does the same for Prisma CLI).
loadEnv({ path: findRootSync(__dirname).rootDir, default_node_env: "development" });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  await app.listen(configService.port);
}
bootstrap();
