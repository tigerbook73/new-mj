import { promises as fs } from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";

// Shared by list/read/write: rejects anything with a path separator or an
// unexpected extension before it ever reaches the filesystem — combined
// with the resolved-path check below, this is the dev-only file API's only
// gate against path traversal, so it's deliberately conservative.
const FILENAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*\.table-layout\.json$/;

// Must stay in sync with where src/features/mahjong keeps its checked-in
// layout data (src/features/mahjong/layouts/) — this plugin runs at Vite
// config time (Node), so it can't import that feature's barrel to derive
// the path without pulling app/React code into the build tooling.
export const resolveLayoutsDir = (root: string) =>
  path.join(root, "src", "features", "mahjong", "layouts");

/** Resolves `name` to an absolute path inside `layoutsDir`, or undefined if it's invalid. */
export function validateLayoutFilename(name: string, layoutsDir: string): string | undefined {
  if (!FILENAME_PATTERN.test(name)) return undefined;
  const resolved = path.resolve(layoutsDir, name);
  return path.dirname(resolved) === path.resolve(layoutsDir) ? resolved : undefined;
}

export type LayoutFileEntry = { name: string; mtimeMs: number };

export async function listLayoutFiles(layoutsDir: string): Promise<LayoutFileEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(layoutsDir);
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries
      .filter((entry) => FILENAME_PATTERN.test(entry))
      .map(async (name) => {
        const stat = await fs.stat(path.join(layoutsDir, name));
        return { name, mtimeMs: stat.mtimeMs };
      }),
  );
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readLayoutFile(
  layoutsDir: string,
  name: string,
): Promise<string | undefined> {
  const resolved = validateLayoutFilename(name, layoutsDir);
  if (!resolved) return undefined;
  try {
    return await fs.readFile(resolved, "utf8");
  } catch {
    return undefined;
  }
}

export async function writeLayoutFile(
  layoutsDir: string,
  name: string,
  content: string,
): Promise<LayoutFileEntry | undefined> {
  const resolved = validateLayoutFilename(name, layoutsDir);
  if (!resolved) return undefined;
  await fs.mkdir(layoutsDir, { recursive: true });
  await fs.writeFile(resolved, content, "utf8");
  const stat = await fs.stat(resolved);
  return { name, mtimeMs: stat.mtimeMs };
}

const readRequestBody = async (req: Connect.IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

// Mounted at "/__dev/layouts", so `req.url` here is already relative to
// that prefix (Connect strips it): "/" for the list endpoint, "/<name>"
// for read/write.
function createLayoutFilesHandler(layoutsDir: string): Connect.NextHandleFunction {
  return (req, res) => {
    void (async () => {
      const url = req.url ?? "/";
      const name = decodeURIComponent(url.split("?")[0]!.replace(/^\/+/, ""));
      try {
        if (req.method === "GET" && name === "") {
          const files = await listLayoutFiles(layoutsDir);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(files));
          return;
        }
        if (req.method === "GET") {
          const content = await readLayoutFile(layoutsDir, name);
          if (content === undefined) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(content);
          return;
        }
        if (req.method === "POST" && name !== "") {
          const body = await readRequestBody(req);
          const result = await writeLayoutFile(layoutsDir, name, body);
          if (!result) {
            res.statusCode = 400;
            res.end("Invalid filename");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
          return;
        }
        res.statusCode = 405;
        res.end("Method not allowed");
      } catch (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : "Internal error");
      }
    })();
  };
}

/** Dev-only file read/write API for Table Layout Lab presets, backed by apps/web/src/features/mahjong/layouts/. */
export function layoutFilesPlugin(): Plugin {
  return {
    name: "layout-files-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        "/__dev/layouts",
        createLayoutFilesHandler(resolveLayoutsDir(server.config.root)),
      );
    },
  };
}
