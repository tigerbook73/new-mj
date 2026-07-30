import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { desktopTableLayoutConfig } from "@/features/mahjong/desktop.table-config";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { sortTilesForDisplay, tileKindOf } from "@/features/mahjong/lib/mahjongTiles";
import { cn } from "@/shared/lib/utils";
import { ActionLabel } from "./ActionLabel";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { Tile } from "./Tile";

type Action = Record<string, unknown>;
type Meld = { type: string; tiles: number[] };

const ACTION_LABELS: Record<string, string> = {
  chi: "吃",
  peng: "碰",
  minGang: "明杠",
  anGang: "暗杠",
  buGang: "补杠",
  hu: "胡",
  zimo: "自摸",
  pass: "过",
};

interface ActionDockProps {
  actions: Action[];
  onAction: (action: Action) => void;
  recommendedAction?: Action | undefined;
  hand: number[];
  melds?: Meld[] | undefined;
  lastDiscard?: number | undefined;
  justDrawn?: number | undefined;
  deadline?: number | null | undefined;
  error?: string | null | undefined;
  config?: TableLayoutConfig | undefined;
}

const actionLabel = (type: string) => ACTION_LABELS[type] ?? type;
const actionKey = (action: Action) => JSON.stringify(action);
const CLAIM_MELD_TYPES = new Set(["chi", "peng", "minGang"]);
function ActionCandidate({
  action,
  hand,
  melds = [],
  lastDiscard,
  justDrawn,
  metrics,
}: {
  action: Action;
  hand: number[];
  melds?: Meld[] | undefined;
  lastDiscard?: number | undefined;
  justDrawn?: number | undefined;
  metrics: TableLayoutConfig["actionDockZone"];
}) {
  const isClaimMeld = CLAIM_MELD_TYPES.has(String(action.type));
  const contextTile =
    action.type === "zimo"
      ? justDrawn
      : action.type === "hu" || action.type === "pass"
        ? lastDiscard
        : undefined;
  const actionTiles = Array.isArray(action.tiles)
    ? action.tiles
    : action.tile === undefined
      ? contextTile === undefined
        ? []
        : [contextTile]
      : [action.tile];
  const actionTile = typeof action.tile === "number" ? action.tile : undefined;
  const actionKind = typeof action.kind === "string" ? action.kind : undefined;
  const matchingPeng =
    action.type === "buGang" && actionTile !== undefined
      ? melds.find(
          (meld) =>
            meld.type === "peng" &&
            meld.tiles.some((tile) => tileKindOf(tile) === tileKindOf(actionTile)),
        )
      : undefined;
  const claimHandCount = action.type === "minGang" ? 3 : 2;
  const ownTiles =
    action.type === "anGang" && actionKind !== undefined
      ? hand.filter((tile) => tileKindOf(tile) === actionKind).slice(0, 4)
      : action.type === "buGang" && matchingPeng && actionTile !== undefined
        ? [...matchingPeng.tiles, actionTile]
        : (action.type === "peng" || action.type === "minGang") && lastDiscard !== undefined
          ? hand
              .filter((tile) => tileKindOf(tile) === tileKindOf(lastDiscard))
              .slice(0, claimHandCount)
          : actionTiles;
  // A chi must read as an ordered sequence, whereas peng/minGang keep the
  // claimed discard at the end to distinguish the target from the hand tiles.
  const tiles =
    isClaimMeld && lastDiscard !== undefined
      ? action.type === "chi"
        ? sortTilesForDisplay([...ownTiles.map(Number), lastDiscard])
        : [...ownTiles, lastDiscard]
      : ownTiles;
  if (tiles.length > 0) {
    return (
      <span className="flex h-full items-center gap-1">
        {tiles.map((tile, index) => {
          const isTarget =
            (isClaimMeld && Number(tile) === lastDiscard) ||
            (action.type === "buGang" && Number(tile) === actionTile);
          return (
            <Tile
              key={`${String(tile)}-${index}`}
              tileId={Number(tile)}
              height={`${metrics.candidateHeight}%`}
              justDiscarded={isTarget}
              {...(isTarget ? { testId: "action-target-tile" } : {})}
            />
          );
        })}
      </span>
    );
  }
  const label = action.kind === undefined ? actionLabel(String(action.type)) : String(action.kind);
  return <ActionLabel text={label} style={{ height: `${metrics.candidateHeight}%` }} />;
}

export function ActionDock({
  actions,
  onAction,
  recommendedAction,
  hand,
  melds,
  lastDiscard,
  justDrawn,
  deadline,
  error,
  config = desktopTableLayoutConfig,
}: ActionDockProps) {
  const metrics = config.actionDockZone;
  const [activeType, setActiveType] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, string>>({});
  const groups = Object.values(
    actions
      .filter((action) => action.type !== "discard")
      .reduce<Record<string, Action[]>>((result, action) => {
        const type = String(action.type);
        (result[type] ??= []).push(action);
        return result;
      }, {}),
  );
  const recommendedKey = recommendedAction ? actionKey(recommendedAction) : undefined;
  const defaultGroup =
    groups.find((group) => group.some((action) => actionKey(action) === recommendedKey)) ??
    groups[0];
  const activeGroup = groups.find((group) => String(group[0]?.type) === activeType) ?? defaultGroup;
  const hideHuCandidateUntilHover = activeType === null && activeGroup?.[0]?.type === "hu";

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  if (groups.length === 0) return null;

  const defaultCandidate = (group: Action[]) =>
    group.find((action) => actionKey(action) === recommendedKey) ?? group[0]!;
  const activate = (group: Action[]) => {
    const type = String(group[0]?.type);
    setActiveType(type);
    setSelectedKeys((previous) =>
      previous[type] ? previous : { ...previous, [type]: actionKey(defaultCandidate(group)) },
    );
  };

  return (
    <div
      data-testid="action-dock"
      aria-label="合法动作"
      className="relative flex h-full w-full flex-col"
    >
      <DeadlineCountdown deadline={deadline} />
      <div
        style={{ height: `${metrics.actionsHeight}%` }}
        className="flex w-full flex-wrap items-center justify-center gap-2"
      >
        {groups.map((group) => {
          const type = String(group[0]?.type);
          const multiple = group.length > 1;
          // Recommendation only picks which group is active by default (via
          // defaultGroup above) — it gets no visual treatment of its own
          // beyond that; a button looks "picked" exactly when it's the
          // active group, same as a candidate looks "picked" when selected.
          const isActive = type === String(activeGroup?.[0]?.type);
          const label = actionLabel(type);
          return (
            <Button
              key={type}
              aria-label={label}
              variant={isActive ? "default" : "outline"}
              className={cn("p-0", !isActive && "bg-background/80 text-foreground")}
              style={{ height: `${metrics.actionButtonHeight}%` }}
              onMouseEnter={() => activate(group)}
              onFocus={() => activate(group)}
              onClick={() => {
                if (multiple) activate(group);
                else onAction(group[0]!);
              }}
            >
              <ActionLabel text={label} />
            </Button>
          );
        })}
      </div>
      <div
        data-testid="action-candidates"
        style={{ height: `${100 - metrics.actionsHeight}%` }}
        className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-white/20"
      >
        {!hideHuCandidateUntilHover &&
          activeGroup?.map((action, index) => {
            const type = String(action.type);
            const selectedKey = selectedKeys[type] ?? actionKey(defaultCandidate(activeGroup));
            const selected = actionKey(action) === selectedKey;
            return (
              <Button
                key={index}
                aria-label={`选择 ${actionLabel(type)}：${
                  Array.isArray(action.tiles)
                    ? action.tiles.join(", ")
                    : String(action.tile ?? action.kind ?? "")
                }`}
                aria-pressed={selected}
                data-selected={selected || undefined}
                variant={selected ? "default" : "outline"}
                className="h-full items-center gap-1 bg-background/60 p-1"
                onMouseEnter={() =>
                  setSelectedKeys((previous) => ({ ...previous, [type]: actionKey(action) }))
                }
                onFocus={() =>
                  setSelectedKeys((previous) => ({ ...previous, [type]: actionKey(action) }))
                }
                onClick={() => onAction(action)}
              >
                <ActionCandidate
                  action={action}
                  hand={hand}
                  melds={melds}
                  lastDiscard={lastDiscard}
                  justDrawn={justDrawn}
                  metrics={metrics}
                />
              </Button>
            );
          })}
      </div>
    </div>
  );
}
