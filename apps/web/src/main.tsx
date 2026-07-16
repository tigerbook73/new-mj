import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import "@/index.css";

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
