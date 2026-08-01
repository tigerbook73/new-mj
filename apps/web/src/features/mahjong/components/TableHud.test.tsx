import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { TableHud } from "./TableHud";

const baseProps = {
  rulesetId: "junk",
  roomName: "Table 1",
  gameNumber: 2,
  totalGames: 8,
  dealer: 0,
  scores: [1000, 1000, 1000, 1000],
  players: [null, null, null, null],
  onLeave: () => {},
};

describe("TableHud", () => {
  it("renders its panel content inside a SidebarProvider", () => {
    // Sidebar's `useSidebar()` requires a SidebarProvider ancestor — TableView.tsx supplies
    // the real one; this test provides a minimal stand-in.
    const markup = renderToStaticMarkup(
      createElement(SidebarProvider, null, createElement(TableHud, baseProps)),
    );
    expect(markup).toContain('data-testid="table-hud-panel"');
    expect(markup).toContain("Leave room");
  });
});
