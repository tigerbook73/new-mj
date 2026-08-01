import type { TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { useAudioStore } from "@/shared/store/audio.store";

// Action clips are hand-authored (public/sounds/{chi,peng,...}.m4a); tile-kind
// clips are the full 34-kind voice set (public/sounds/{1m,...,7z}.m4a) — see
// docs/process/plan.md 可选沉浸体验. Both live in the same flat directory and
// share the same playback path, so one union covers both.
export type SoundName = "chi" | "peng" | "gang" | "angang" | "bugang" | "hu" | "zimo" | "pass" | TileKind;

// A ~0-length silent WAV, used only to satisfy the browser's autoplay-unlock
// requirement (see unlockAudioPlayback below) — no network request, no
// dependency on the real sound files landing in public/sounds/ first.
const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";

const cache = new Map<SoundName, HTMLAudioElement>();

const getAudio = (name: SoundName): HTMLAudioElement => {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(`/sounds/${name}.m4a`);
    cache.set(name, audio);
  }
  return audio;
};

/**
 * Plays a short sound effect for a live table event (see TableView.tsx's
 * `onEvent`). Silently no-ops on anything that can go wrong — muted, the
 * sound file hasn't been dropped into public/sounds/ yet (404), or the
 * browser's autoplay policy still blocks it — none of those should ever
 * throw or spam the console; this is cosmetic, not a real error.
 */
export const playSound = (name: SoundName): void => {
  const { muted, volume } = useAudioStore.getState();
  if (muted) return;
  const audio = getAudio(name);
  audio.volume = volume;
  audio.currentTime = 0;
  audio.play()?.catch(() => {});
};

let unlocked = false;

/**
 * Browsers only allow the *first* programmatic `.play()` on a page if it
 * happens synchronously inside a user-gesture handler. `playSound` above is
 * called from an async socket event callback, which is never inside that
 * call stack — so without this, the very first sound would silently fail
 * even with a real audio file in place. Standard workaround: play a silent
 * clip once, directly inside the page's first pointerdown/keydown, which
 * unlocks every later programmatic `.play()` for the rest of the session.
 * Call once at app startup (see app/App.tsx); it removes its own listeners
 * after firing.
 */
export const unlockAudioPlayback = (): void => {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    const silence = new Audio(SILENT_AUDIO_DATA_URI);
    silence.volume = 0;
    silence.play()?.catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
};
