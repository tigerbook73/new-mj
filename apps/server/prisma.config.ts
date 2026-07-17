// Prisma 7's CLI no longer auto-loads .env — loads repo-root .env* here (root found via find-root, not hand-counted `..`; main.ts does the same for NestJS runtime).
import { findRootSync } from "@manypkg/find-root";
import { config as loadEnv } from "dotenv-flow";
import { defineConfig } from "prisma/config";

loadEnv({ path: findRootSync(__dirname).rootDir, default_node_env: "development" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Ensure we don't assign a possibly-undefined value to `url` (TS
  // exactOptionalPropertyTypes). Omit the property when DATABASE_URL is
  // not set.
  datasource: (() => {
    const dbUrl = process.env["DATABASE_URL"];
    return dbUrl ? { url: dbUrl } : {};
  })(),
});
