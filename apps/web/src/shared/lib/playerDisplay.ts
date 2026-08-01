/** Two-letter fallback avatar label for players without an `avatar` URL. */
export const initials = (nickname: string): string =>
  nickname.replace(/\s/g, "").slice(0, 2).toUpperCase();

const RULESET_LABELS: Record<string, string> = {
  junk: "垃圾胡",
  bloodbattle: "血战到底",
  hangzhou: "杭州麻将",
};

/** Chinese display name for a ruleset id; falls back to the raw id for unregistered ones. */
export const rulesetLabel = (rulesetId: string): string => RULESET_LABELS[rulesetId] ?? rulesetId;
