import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tile } from "./Tile";

const meta = {
  title: "Mahjong/01 Tile",
  component: Tile,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Matches DEFAULT_TABLE_LAYOUT_CONFIG.tiles.aspectRatio (height / width). */
const ASPECT_RATIO = 1.333;
const dims = (widthPx: number) => ({ widthPx, heightPx: Math.round(widthPx * ASPECT_RATIO) });

export const AllFaces: Story = {
  name: "All 34 faces",
  render: () => (
    <div className="grid grid-cols-9 gap-2" aria-label="All Mahjong tile faces">
      {Array.from({ length: 34 }, (_, kindIndex) => (
        <Tile key={kindIndex} tileId={kindIndex * 4} {...dims(44)} />
      ))}
    </div>
  ),
};

export const SizesAndBack: Story = {
  name: "Sizes and back",
  render: () => (
    <div className="flex items-end gap-4">
      <Tile tileId={0} {...dims(32)} />
      <Tile tileId={36} {...dims(44)} />
      <Tile tileId={72} {...dims(56)} />
      <Tile back {...dims(44)} />
    </div>
  ),
};

export const InteractionStates: Story = {
  name: "Interaction states",
  render: () => (
    <div className="flex items-end gap-5 text-center text-xs">
      <div>
        <Tile tileId={4} {...dims(44)} />
        <p>normal</p>
      </div>
      <div>
        <Tile tileId={8} clickable {...dims(44)} />
        <p>clickable</p>
      </div>
      <div>
        <Tile tileId={12} selected {...dims(44)} />
        <p>selected</p>
      </div>
      <div>
        <Tile tileId={16} dimmed {...dims(44)} />
        <p>dimmed</p>
      </div>
      <div>
        <Tile tileId={20} justDiscarded {...dims(44)} />
        <p>justDiscarded</p>
      </div>
    </div>
  ),
};
