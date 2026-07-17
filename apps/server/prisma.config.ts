// Prisma 7's CLI no longer auto-loads .env (unlike v5/v6) — this file is
// how `prisma migrate`/`prisma generate` learn DATABASE_URL and where the
// schema lives. Not consumed at NestJS runtime; ConfigService/main.ts load
// .env separately for that (see apps/server/src/main.ts).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
