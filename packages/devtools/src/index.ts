export type WorktreeConfig = {
  slot: number;
  devServerPort: number;
  devWebPort: number;
  e2eServerPort: number;
  e2eWebPort: number;
};

const MAX_SLOT = 99;

export const parseWorktreeSlot = (raw: string | undefined): number => {
  const slot = raw ? Number(raw) : 0;
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT)
    throw new Error(`worktree slot must be an integer from 0 to ${MAX_SLOT}; received ${raw}`);
  return slot;
};

export const worktreeConfigFor = (slot: number): WorktreeConfig => {
  parseWorktreeSlot(String(slot));
  return {
    slot,
    devServerPort: 3000 + slot,
    devWebPort: 5173 + slot,
    e2eServerPort: 3100 + slot,
    e2eWebPort: 5274 + slot,
  };
};

export const worktreeEnvironment = (
  config: WorktreeConfig,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...base,
  PORT: String(config.devServerPort),
  VITE_PORT: String(config.devWebPort),
  VITE_SERVER_URL: `http://localhost:${config.devServerPort}`,
  E2E_SERVER_PORT: String(config.e2eServerPort),
  E2E_WEB_PORT: String(config.e2eWebPort),
  E2E_WORKERS: "1",
});

export const firstAvailableWorktreeSlot = (claimedSlots: Iterable<number>): number => {
  const claimed = new Set(claimedSlots);
  for (let slot = 0; slot <= MAX_SLOT; slot += 1) {
    if (!claimed.has(slot)) return slot;
  }
  throw new Error(`no worktree slots available (0-${MAX_SLOT})`);
};

export const environmentLinkNames = (
  entries: Iterable<{ name: string; isLinkable: boolean }>,
  isIgnored: (name: string) => boolean,
): string[] =>
  [...entries]
    .filter(({ name, isLinkable }) => isLinkable && name.startsWith(".env.") && isIgnored(name))
    .map(({ name }) => name)
    .sort();

const readPort = (name: string, fallback: number, env: NodeJS.ProcessEnv): number => {
  const raw = env[name];
  if (!raw) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`${name} must be an integer TCP port; received ${raw}`);
  return port;
};

export const viteWorktreeServer = (env: NodeJS.ProcessEnv = process.env) => {
  const raw = env["VITE_PORT"];
  if (!raw) return undefined;
  return { port: readPort("VITE_PORT", 5173, env), strictPort: true };
};

export const playwrightWorktreeRuntime = (env: NodeJS.ProcessEnv = process.env) => {
  const workersRaw = env["E2E_WORKERS"];
  let workers: number | undefined;
  if (workersRaw) {
    workers = Number(workersRaw);
    if (!Number.isInteger(workers) || workers < 1)
      throw new Error(`E2E_WORKERS must be a positive integer; received ${workersRaw}`);
  }

  const webPort = readPort("E2E_WEB_PORT", 5274, env);
  const serverPort = readPort("E2E_SERVER_PORT", 3100, env);
  return { webPort, serverPort, workers, baseURL: `http://localhost:${webPort}` };
};
