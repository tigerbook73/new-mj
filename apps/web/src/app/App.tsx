import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { unlockAudioPlayback } from "@/shared/lib/sounds";
import { applyTheme } from "@/shared/lib/theme";
import { router } from "@/app/router";

export function App() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyTheme(media.matches ? "dark" : "light");
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  // Arms the one-time gesture listener that unlocks programmatic sound
  // playback for the rest of the page session — see sounds.ts's own doc.
  useEffect(() => {
    unlockAudioPlayback();
  }, []);

  return <RouterProvider router={router} />;
}
