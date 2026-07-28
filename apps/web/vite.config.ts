import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { layoutFilesPlugin } from "./dev/layoutFilesPlugin";

const configuredPort = process.env["VITE_PORT"];
const port = configuredPort ? Number(configuredPort) : undefined;
if (configuredPort && (!Number.isInteger(port) || !port || port < 1 || port > 65_535))
  throw new Error(`VITE_PORT must be an integer TCP port; received ${configuredPort}`);
const server = port ? { server: { port, strictPort: true } } : {};

export default defineConfig({
  plugins: [react(), tailwindcss(), layoutFilesPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Repo keeps one root .env (apps/server needs the same values, e.g.
  // SUPABASE_URL) rather than a duplicate copy under apps/web — Vite only
  // exposes VITE_-prefixed keys to client code either way, so this doesn't
  // leak server-only secrets (SUPABASE_SERVICE_KEY, DATABASE_URL, etc.).
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  ...server,
});
