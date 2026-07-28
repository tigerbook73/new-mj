import { useEffect } from "react";
import { RouterProvider } from "react-router";
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

  return <RouterProvider router={router} />;
}
