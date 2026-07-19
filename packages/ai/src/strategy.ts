/**
 * Deliberately weak, ruleset-agnostic strategy: always takes a win when one
 * is legal, otherwise picks uniformly at random. Phase 4's only requirement
 * is "AI can be weak, but must exist" (phase 4)
 * — this is the simplest thing that finishes a game without ever missing an
 * obvious win.
 */
export const chooseAction = <TAction>(legalActions: readonly TAction[]): TAction => {
  if (legalActions.length === 0) {
    throw new Error("chooseAction called with no legal actions");
  }
  const winning = legalActions.find(isWinningAction);
  if (winning !== undefined) return winning;
  return legalActions[Math.floor(Math.random() * legalActions.length)] as TAction;
};

/**
 * Deterministic, visibility-safe recommendation for a human-facing hint.
 * The view parameter makes the information boundary explicit even though
 * this intentionally weak first version only needs the legal action list.
 */
export const recommendAction = <TView, TAction>(
  playerView: TView,
  legalActions: readonly TAction[],
): TAction | undefined => {
  void playerView;
  const winning = legalActions.find(isWinningAction);
  return winning ?? legalActions[0];
};

const isWinningAction = (action: unknown): boolean =>
  typeof action === "object" &&
  action !== null &&
  "type" in action &&
  (action.type === "hu" || action.type === "zimo");
