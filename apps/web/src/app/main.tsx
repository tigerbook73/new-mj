import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { applyTheme, getInitialTheme } from "@/shared/lib/theme";
import "@/app/index.css";

// Applied before the first paint (not inside a component effect) so a
// dark-preference visitor never sees a flash of the light theme.
applyTheme(getInitialTheme());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
