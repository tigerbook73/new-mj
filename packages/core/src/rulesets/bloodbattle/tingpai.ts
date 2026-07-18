import type { TileKind } from "../../lib/ids.ts";
import { scoreBloodbattleHand } from "./scoring.ts";
import { BLOODBATTLE_SUITS } from "./constants.ts";

const kinds = BLOODBATTLE_SUITS.flatMap((suit) =>
  Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as TileKind),
);

type ScoringMeld = { type: "peng" | "anGang" | "minGang" | "buGang"; tiles: TileKind[] };
export const ronCandidates = (
  hand: TileKind[],
  melds: ScoringMeld[],
  lack: "m" | "p" | "s",
): TileKind[] =>
  kinds.filter(
    (tile) =>
      tile[1] !== lack &&
      scoreBloodbattleHand({
        config: { capFan: null, selfDrawBonus: "addFan" },
        hand,
        melds,
        lack,
        win: { tile, by: "discard" },
      }).hu,
  );

export const isTingpai = (hand: TileKind[], melds: ScoringMeld[], lack: "m" | "p" | "s"): boolean =>
  ronCandidates(hand, melds, lack).length > 0;
