import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionDock } from "./ActionDock";

const meta = {
  title: "Mahjong/04 Action Dock",
  component: ActionDock,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div
        className="w-[560px] rounded-xl bg-slate-950/80 p-4 text-white"
        style={{ containerType: "size" }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActionDock>;

export default meta;
type Story = StoryObj<typeof meta>;

const onAction = (_action: Record<string, unknown>) => undefined;

export const MultipleChi: Story = {
  name: "Multiple chi candidates",
  args: {
    hand: [2, 5, 6, 7, 9],
    actions: [{ type: "chi", tiles: [2, 9] }, { type: "chi", tiles: [9, 12] }, { type: "pass" }],
    recommendedAction: { type: "chi", tiles: [9, 12] },
    lastDiscard: 4,
    onAction,
  },
};

export const FullDecisionSet: Story = {
  name: "Full decision set: chi, peng, gang, hu",
  args: {
    hand: [2, 5, 6, 7, 9, 12, 16, 17, 18, 19, 68],
    melds: [{ type: "peng", tiles: [69, 70, 71] }],
    actions: [
      { type: "chi", tiles: [2, 9] },
      { type: "chi", tiles: [9, 12] },
      { type: "peng" },
      { type: "minGang" },
      { type: "anGang", kind: "5m" },
      { type: "buGang", tile: 68 },
      { type: "hu" },
      { type: "pass" },
    ],
    recommendedAction: { type: "chi", tiles: [9, 12] },
    lastDiscard: 4,
    justDrawn: 68,
    onAction,
  },
};

export const ClaimHuAndPass: Story = {
  name: "Hu and pass show the discard",
  args: {
    hand: [],
    actions: [{ type: "hu" }, { type: "pass" }],
    recommendedAction: { type: "hu" },
    lastDiscard: 76,
    onAction,
  },
};

export const SelfDraw: Story = {
  name: "Zimo shows the drawn tile",
  args: {
    hand: [16, 17, 18, 19, 68],
    actions: [{ type: "zimo" }, { type: "anGang", kind: "5m" }],
    recommendedAction: { type: "zimo" },
    justDrawn: 68,
    onAction,
  },
};
