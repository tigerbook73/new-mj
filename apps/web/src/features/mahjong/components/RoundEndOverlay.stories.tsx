import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatePresence } from "motion/react";
import type { RoomInfo } from "@new-mj/protocol";
import { Button } from "@/shared/ui/button";
import { RoundEndOverlay } from "./RoundEndOverlay";

const meta = {
  title: "Mahjong/06 Round End Overlay",
  component: RoundEndOverlay,
  parameters: { layout: "centered" },
} satisfies Meta<typeof RoundEndOverlay>;

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

/** Named component (not an inline arrow in `render`) so the rules-of-hooks lint recognizes `useState` below as a real component. */
function ToggleMountUnmountDemo() {
  const [visible, setVisible] = useState(true);
  return (
    <div className="relative h-100 w-150 rounded-xl bg-green-900">
      <Button className="absolute top-2 left-2 z-40" onClick={() => setVisible((v) => !v)}>
        Toggle
      </Button>
      <AnimatePresence>
        {visible && (
          <RoundEndOverlay
            key="round-end-overlay"
            result={{
              type: "win",
              winner: 0,
              winners: [0],
              winType: "zimo",
              scoreDeltas: [24, -8, -8, -8],
            }}
            gameNumber={2}
            totalGames={8}
            players={players}
            myConfirmed={false}
            onConfirm={() => undefined}
            onEnd={() => undefined}
            entering
            reducedMotion={false}
            winningHands={[
              [
                ["1m", "2m", "3m"],
                ["5p", "5p", "5p"],
                ["7s", "8s", "9s"],
                ["9m", "9m"],
              ],
            ]}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Phase 5d: mounts/unmounts under `<AnimatePresence>` exactly like
 * TableView.tsx does, so toggling this button is the only way to actually
 * see the enter/exit transition — static `args` alone never re-render the
 * presence boundary. Not connected to socket/core; pure fixture data.
 */
export const ToggleMountUnmount: Story = {
  name: "Toggle mount/unmount (win)",
  // `render` drives the actual demo below; `args` only exists to satisfy
  // this story's required props (component-typed meta wants them even
  // though `render` ignores them in favor of its own local state).
  args: {
    result: {
      type: "win",
      winner: 0,
      winners: [0],
      winType: "zimo",
      scoreDeltas: [24, -8, -8, -8],
    },
    gameNumber: 2,
    totalGames: 8,
    players,
    myConfirmed: false,
    onConfirm: () => undefined,
    onEnd: () => undefined,
    entering: true,
    reducedMotion: false,
  },
  render: () => <ToggleMountUnmountDemo />,
};

export const Draw: Story = {
  name: "Draw (wall exhausted)",
  args: {
    result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
    gameNumber: 3,
    totalGames: 8,
    players,
    myConfirmed: true,
    onConfirm: () => undefined,
    onEnd: () => undefined,
    entering: false,
    reducedMotion: false,
  },
};
