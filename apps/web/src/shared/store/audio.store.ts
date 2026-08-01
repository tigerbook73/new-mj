import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Volume/mute preference for in-table sound effects (see shared/lib/sounds.ts).
 * Persisted to localStorage (unlike tableLayout.store.ts's tileTheme) since a
 * mute choice is exactly the kind of thing a user shouldn't have to repeat
 * every reload.
 */
export type AudioState = {
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
};

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      volume: 0.6,
      muted: false,
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      toggleMuted: () => set((state) => ({ muted: !state.muted })),
    }),
    {
      name: "mj-audio-settings",
      // zustand's own default storage reads `window.localStorage`; this codebase
      // otherwise always references the bare global (see shared/lib/clientIdentity.ts),
      // and the bare form is also what's testable by stubbing globalThis.localStorage
      // in a plain Node test environment (no window at all).
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
