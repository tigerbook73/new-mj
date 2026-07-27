/**
 * Client wrapper for the dev-only file read/write API mounted by
 * apps/web/dev/layoutFilesPlugin.ts (Vite `configureServer`, `apply: "serve"`
 * — never present in a production build). Only ever called from
 * `import.meta.env.DEV`-gated Layout Lab code.
 */
export type LayoutFileEntry = { name: string; mtimeMs: number };

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/__dev/layouts${path}`, init);
  if (!response.ok)
    throw new Error(`${init?.method ?? "GET"} ${path} failed with ${response.status}`);
  return response;
}

export const listLayoutFiles = async (): Promise<LayoutFileEntry[]> =>
  (await request("")).json() as Promise<LayoutFileEntry[]>;

export const readLayoutFile = async (name: string): Promise<string> =>
  (await request(`/${encodeURIComponent(name)}`)).text();

export const writeLayoutFile = async (name: string, content: string): Promise<LayoutFileEntry> =>
  (
    await request(`/${encodeURIComponent(name)}`, {
      method: "POST",
      body: content,
    })
  ).json() as Promise<LayoutFileEntry>;
