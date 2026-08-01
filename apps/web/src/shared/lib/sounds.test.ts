import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory Storage stand-in, stubbed before import — see audio.store.test.ts's doc. */
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
vi.stubGlobal("localStorage", makeStorage());

let rejectNextPlay = false;
const constructed: string[] = [];
const played: FakeAudio[] = [];

class FakeAudio {
  src: string;
  volume = 1;
  currentTime = 0;
  constructor(src?: string) {
    this.src = src ?? "";
    constructed.push(this.src);
  }
  play(): Promise<void> {
    played.push(this);
    return rejectNextPlay ? Promise.reject(new Error("blocked")) : Promise.resolve();
  }
}
vi.stubGlobal("Audio", FakeAudio);
// unlockAudioPlayback's `typeof window === "undefined"` guard needs a real
// addEventListener/removeEventListener with capture-flag support — a plain
// EventTarget (built into Node) provides exactly that.
vi.stubGlobal("window", new EventTarget());

const { playSound } = await import("./sounds");
const { useAudioStore } = await import("../store/audio.store");

beforeEach(() => {
  rejectNextPlay = false;
  constructed.length = 0;
  played.length = 0;
  useAudioStore.setState({ volume: 0.6, muted: false });
});

describe("playSound", () => {
  it("does nothing while muted", () => {
    useAudioStore.setState({ muted: true });
    playSound("chi");
    expect(played).toHaveLength(0);
  });

  it("creates the audio element from /sounds/<name>.m4a and plays it at the current volume", () => {
    useAudioStore.setState({ volume: 0.4 });
    playSound("hu");
    expect(constructed).toEqual(["/sounds/hu.m4a"]);
    expect(played).toHaveLength(1);
    expect(played[0]!.volume).toBe(0.4);
  });

  it("reuses the same element across repeated calls instead of re-constructing it", () => {
    playSound("peng");
    playSound("peng");
    expect(constructed).toEqual(["/sounds/peng.m4a"]);
    expect(played).toHaveLength(2);
  });

  it("swallows a rejected play() (missing file / autoplay policy) without throwing", () => {
    rejectNextPlay = true;
    expect(() => playSound("chi")).not.toThrow();
  });
});

describe("unlockAudioPlayback", () => {
  it("unlocks on the first pointerdown by playing a silent clip, then stops listening", async () => {
    const { unlockAudioPlayback } = await import("./sounds");
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    unlockAudioPlayback();
    expect(addSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);

    const before = played.length;
    window.dispatchEvent(new Event("pointerdown"));
    expect(played.length).toBe(before + 1);
    expect(removeSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);

    // Already unlocked module-wide (see sounds.ts's `unlocked` flag) — calling
    // again must not re-register listeners.
    addSpy.mockClear();
    unlockAudioPlayback();
    expect(addSpy).not.toHaveBeenCalled();
  });
});
