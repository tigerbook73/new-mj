import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { sortTilesForDisplay, tileKindOf } from "@/lib/mahjongTiles";
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
}

const actionLabel = (type: string) => ACTION_LABELS[type] ?? type;
const actionKey = (action: Action) => JSON.stringify(action);
const CLAIM_MELD_TYPES = new Set(["chi", "peng", "minGang"]);
const ACTION_BUTTON_STYLE = {
  height: "clamp(1.5rem, 16cqb, 2.5rem)",
  paddingInline: "clamp(0.35rem, 3cqi, 0.75rem)",
  fontSize: "clamp(0.5rem, 5cqi, 1rem)",
};
const CANDIDATE_BUTTON_STYLE = {
  paddingInline: "clamp(0.35rem, 2cqi, 0.7rem)",
  paddingBlock: "clamp(0.2rem, 1.5cqb, 0.45rem)",
  fontSize: "clamp(0.5rem, 5cqi, 1rem)",
};
const CANDIDATE_TILE_WIDTH = "clamp(12px, 8cqi, 44px)";
const CANDIDATE_TILE_HEIGHT = "clamp(16px, 11cqi, 59px)";

function ActionCandidate({
  action,
  hand,
  melds = [],
  lastDiscard,
  justDrawn,
}: {
  action: Action;
  hand: number[];
  melds?: Meld[] | undefined;
  lastDiscard?: number | undefined;
  justDrawn?: number | undefined;
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
      <span className="flex" style={{ gap: "clamp(2px, 1cqi, 6px)" }}>
        {tiles.map((tile, index) => {
          const isTarget =
            (isClaimMeld && Number(tile) === lastDiscard) ||
            (action.type === "buGang" && Number(tile) === actionTile);
          return (
            <Tile
              key={`${String(tile)}-${index}`}
              tileId={Number(tile)}
              widthPx={CANDIDATE_TILE_WIDTH}
              heightPx={CANDIDATE_TILE_HEIGHT}
              justDiscarded={isTarget}
              {...(isTarget ? { testId: "action-target-tile" } : {})}
            />
          );
        })}
      </span>
    );
  }
  return (
    <span>
      {action.kind === undefined ? actionLabel(String(action.type)) : String(action.kind)}
    </span>
  );
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
}: ActionDockProps) {
  const [activeType, setActiveType] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, string>>({});
  const [now, setNow] = useState<number | null>(null);
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
  const remainingSeconds =
    deadline === undefined || deadline === null || now === null
      ? undefined
      : Math.max(0, Math.ceil((deadline - now) / 1_000));

  useEffect(() => {
    if (deadline === undefined || deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

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
      className="flex h-full w-full flex-wrap justify-center gap-1"
      style={{ containerType: "size", gap: "clamp(0.2rem, 1.5cqi, 0.5rem)" }}
    >
      {groups.map((group) => {
        const type = String(group[0]?.type);
        const multiple = group.length > 1;
        const recommended = group.some((action) => actionKey(action) === recommendedKey);
        return (
          <Button
            key={type}
            size="sm"
            variant={recommended ? "default" : "outline"}
            className={recommended ? undefined : "bg-background/80 text-foreground"}
            style={ACTION_BUTTON_STYLE}
            onMouseEnter={() => activate(group)}
            onFocus={() => activate(group)}
            onClick={() => {
              if (multiple) activate(group);
              else onAction(group[0]!);
            }}
          >
            {actionLabel(type)}
            {recommended ? " · 推荐" : ""}
          </Button>
        );
      })}
      <div
        data-testid="action-candidates"
        className="flex w-full flex-wrap justify-center border-t border-white/20"
        style={{
          minHeight: "clamp(3rem, 42cqb, 8rem)",
          gap: "clamp(0.25rem, 2cqi, 0.75rem)",
          paddingTop: "clamp(0.3rem, 3cqb, 0.75rem)",
        }}
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
                className="h-auto gap-1 bg-background/70"
                style={CANDIDATE_BUTTON_STYLE}
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
                />
              </Button>
            );
          })}
      </div>
      {remainingSeconds !== undefined && (
        <p
          data-testid="action-deadline"
          aria-live="polite"
          className="w-full text-center text-white/80"
          style={{ fontSize: "clamp(0.5rem, 5cqi, 0.85rem)" }}
        >
          声明倒计时：{remainingSeconds} 秒
        </p>
      )}
      {remainingSeconds === undefined && deadline !== undefined && deadline !== null && (
        <p
          data-testid="action-deadline"
          aria-live="polite"
          className="w-full text-center text-white/80"
          style={{ fontSize: "clamp(0.5rem, 5cqi, 0.85rem)" }}
        >
          声明窗口已开启
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="w-full text-center font-medium text-red-200"
          style={{ fontSize: "clamp(0.5rem, 5cqi, 0.85rem)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
