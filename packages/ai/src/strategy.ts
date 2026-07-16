/**
 * Deliberately weak, ruleset-agnostic strategy: always takes a win when one
 * is legal, otherwise picks uniformly at random. Phase 4's only requirement
 * is "AI can be weak, but must exist" (docs/process/phase-4-junk-complete.md)
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

const isWinningAction = (action: unknown): boolean =>
  typeof action === "object" &&
  action !== null &&
  "type" in action &&
  (action.type === "hu" || action.type === "zimo");
