import { Coins, Eye, Sparkles } from "lucide-react";
import type { StatusBadge } from "@/features/mahjong/components/CenterStatus";
import type { TableViewExtras } from "@/features/mahjong/useTablePresentation";

const BADGE_ICON_CLASS = "size-[6.2cqmin]";

/**
 * Hangzhou-only today (docs/variants/hangzhou.md §4) — junk/bloodbattle simply never set
 * these extras fields, so this always returns []. Kept generic (StatusBadge[], not three
 * named booleans) so a ruleset can add more private badges later without CenterStatus or
 * this function's shape changing.
 */
export function buildStatusBadges(extras: TableViewExtras): StatusBadge[] {
  const badges: StatusBadge[] = [];
  // 爆头 implies 听牌 — show only the stronger badge, not both.
  if (extras.isBaotou) {
    badges.push({
      key: "baotou",
      label: "爆头",
      icon: <Sparkles className={BADGE_ICON_CLASS} />,
      className: "border-amber-400 text-amber-600 dark:text-amber-400",
    });
  } else if (extras.isTingpai) {
    badges.push({
      key: "tingpai",
      label: "听牌",
      icon: <Eye className={BADGE_ICON_CLASS} />,
      className: "border-sky-400 text-sky-600 dark:text-sky-400",
    });
  }
  if (extras.isCaipiao) {
    badges.push({
      key: "caipiao",
      label: "财飘",
      icon: <Coins className={BADGE_ICON_CLASS} />,
      className: "border-rose-400 text-rose-600 dark:text-rose-400",
    });
  }
  return badges;
}
