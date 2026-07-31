import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RoomInfo } from "@new-mj/protocol";
import { HangzhouRoundEndOverlay } from "./HangzhouRoundEndOverlay";

const meta = {
  title: "Mahjong/07 Hangzhou Round End Overlay",
  component: HangzhouRoundEndOverlay,
  parameters: { layout: "centered" },
} satisfies Meta<typeof HangzhouRoundEndOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

const players: RoomInfo["players"] = [
  {
    userId: "1",
    seatId: 0,
    nickname: "Alice",
    isBot: false,
    isReady: true,
    isAutoPiloted: false,
    isDisconnected: false,
  },
  {
    userId: "2",
    seatId: 1,
    nickname: "Bob",
    isBot: false,
    isReady: false,
    isAutoPiloted: false,
    isDisconnected: false,
  },
  {
    userId: "3",
    seatId: 2,
    nickname: "Carol",
    isBot: true,
    isReady: true,
    isAutoPiloted: false,
    isDisconnected: false,
  },
  {
    userId: "4",
    seatId: 3,
    nickname: "Dave",
    isBot: false,
    isReady: false,
    isAutoPiloted: false,
    isDisconnected: false,
  },
];

const baseArgs = {
  gameNumber: 2,
  totalGames: 8,
  players,
  myConfirmed: false,
  onConfirm: () => undefined,
  onEnd: () => undefined,
  entering: false,
  reducedMotion: true,
};

export const BaotouZimo: Story = {
  name: "爆头 self-draw with 杠开",
  args: {
    ...baseArgs,
    result: {
      type: "win",
      winner: 0,
      winners: [{ seat: 0, fanTypes: ["baotou", "gangkai"], multiplier: 4, payout: 4 }],
      winType: "zimo",
      scoreDeltas: [12, -4, -4, -4],
    },
  },
};

export const CaipiaoGangRon: Story = {
  name: '财飘+杠开 ("飘杠") off a discard',
  args: {
    ...baseArgs,
    result: {
      type: "win",
      winner: 1,
      winners: [{ seat: 1, fanTypes: ["caipiao", "gangkai"], multiplier: 8, payout: 8 }],
      winType: "ron",
      from: 0,
      scoreDeltas: [-8, 8, 0, 0],
    },
  },
};

export const HeadJumpMultiRon: Story = {
  name: "Head-jump: one winner shown even off a shared discard",
  args: {
    ...baseArgs,
    result: {
      type: "win",
      winner: 2,
      winners: [{ seat: 2, fanTypes: ["haohuaQiduizi"], multiplier: 4, payout: 4 }],
      winType: "ron",
      from: 3,
      scoreDeltas: [0, 0, 4, -4],
    },
  },
};

export const Draw: Story = {
  name: "Draw (wall exhausted)",
  args: {
    ...baseArgs,
    myConfirmed: true,
    result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
  },
};
