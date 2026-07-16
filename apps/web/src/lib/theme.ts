export type Theme = "light" | "dark";

/** Uses the OS-level preference; the app has no manual theme override. */
export function getInitialTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Applies the `.dark` class the CSS in index.css keys off of. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
