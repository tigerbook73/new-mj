import { motion } from "motion/react";
import type { GameResultLike } from "@/features/mahjong/components/RoundEndOverlay";

interface ResultBannerProps {
  result: GameResultLike;
  reducedMotion: boolean;
}

const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };
const TEXT_INITIAL = { opacity: 0, scale: 0.6 };
const TEXT_ANIMATE = { opacity: 1, scale: 1 };
const TEXT_EXIT = { opacity: 0, scale: 1.15 };

const bannerText = (result: GameResultLike): string => {
  if (result.type === "draw") return "流局";
  return result.winType === "zimo" ? "自摸！" : "胡了！";
};

/**
 * Brief full-bleed flash shown for a fixed window right when a round ends,
 * before RoundEndOverlay (the settlement panel with per-winner detail) takes
 * over — see TableView.tsx's `showResultBanner`. Deliberately generic text
 * (no winner names/fan detail): that's the following panel's job, this is
 * just the "something just happened" beat.
 */
export function ResultBanner({ result, reducedMotion }: ResultBannerProps) {
  const transition = { duration: reducedMotion ? 0 : 0.25, ease: "easeOut" } as const;
  return (
    <motion.div
      data-testid="result-banner"
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40"
      initial={BACKDROP_INITIAL}
      animate={BACKDROP_ANIMATE}
      exit={BACKDROP_EXIT}
      transition={transition}
    >
      <motion.p
        className="text-5xl font-bold text-white drop-shadow-lg"
        initial={reducedMotion ? false : TEXT_INITIAL}
        animate={TEXT_ANIMATE}
        exit={reducedMotion ? { opacity: 0 } : TEXT_EXIT}
        transition={transition}
      >
        {bannerText(result)}
      </motion.p>
    </motion.div>
  );
}
