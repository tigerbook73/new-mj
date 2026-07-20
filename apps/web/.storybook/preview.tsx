import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { TileTheme } from "../src/lib/mahjongTiles";
import { useTableLayoutStore } from "../src/store/tableLayout";
import "../src/index.css";

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
    (Story, context) => {
      useTableLayoutStore.setState({
        tileTheme: context.globals["tileTheme"] as TileTheme,
      });
      return (
        <div className="min-h-screen bg-background p-6 text-foreground">
          <Story />
        </div>
      );
    },
  ],
  globalTypes: {
    tileTheme: {
      description: "Mahjong tile asset set",
      defaultValue: "Regular",
      toolbar: {
        icon: "paintbrush",
        items: ["Regular", "Black"],
      },
    },
  },
  parameters: {
    a11y: { test: "todo" },
    controls: { expanded: true },
    viewport: {
      options: {
        desktop1440: { name: "Desktop 1440×900", styles: { width: "1440px", height: "900px" } },
        desktop1366: { name: "Desktop 1366×768", styles: { width: "1366px", height: "768px" } },
        mobileLandscape: { name: "Mobile 844×390", styles: { width: "844px", height: "390px" } },
        mobilePortrait: { name: "Mobile 390×844", styles: { width: "390px", height: "844px" } },
      },
    },
    options: {
      storySort: {
        order: [
          "Mahjong",
          [
            "01 Tile",
            "02 Hand",
            "03 Wall",
            "04 Discards",
            "05 Melds",
            "06 Player",
            "07 Center",
            "08 Table",
          ],
        ],
      },
    },
  },
};

export default preview;
