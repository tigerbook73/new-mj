import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory Storage stand-in — see shared/lib/socket.test.ts for the same pattern.
 * Stubbed and imported *before* audio.store.ts below: zustand's persist middleware
 * resolves storage availability once, at store-creation time, so localStorage must
 * already exist when the module is first evaluated — stubbing inside beforeEach
 * (i.e. after import) is too late and persist silently gives up on writes.
 */
const makeStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
};

const storage = makeStorage();
vi.stubGlobal("localStorage", storage);

const { useAudioStore } = await import("./audio.store");

beforeEach(() => {
  storage.clear();
  useAudioStore.setState({ volume: 0.6, muted: false });
});

describe("useAudioStore", () => {
  it("defaults to volume 0.6 and unmuted", () => {
    const state = useAudioStore.getState();
    expect(state.volume).toBe(0.6);
    expect(state.muted).toBe(false);
  });

  it("setVolume clamps into [0, 1]", () => {
    useAudioStore.getState().setVolume(1.5);
    expect(useAudioStore.getState().volume).toBe(1);
    useAudioStore.getState().setVolume(-0.5);
    expect(useAudioStore.getState().volume).toBe(0);
    useAudioStore.getState().setVolume(0.3);
    expect(useAudioStore.getState().volume).toBe(0.3);
  });

  it("toggleMuted flips the flag", () => {
    expect(useAudioStore.getState().muted).toBe(false);
    useAudioStore.getState().toggleMuted();
    expect(useAudioStore.getState().muted).toBe(true);
    useAudioStore.getState().toggleMuted();
    expect(useAudioStore.getState().muted).toBe(false);
  });

  it("persists volume/muted to localStorage under the mj-audio-settings key", () => {
    useAudioStore.getState().setVolume(0.2);
    useAudioStore.getState().toggleMuted();
    const raw = storage.getItem("mj-audio-settings");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { volume: number; muted: boolean } };
    expect(parsed.state.volume).toBe(0.2);
    expect(parsed.state.muted).toBe(true);
  });
});
