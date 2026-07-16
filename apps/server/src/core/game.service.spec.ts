import { GameService } from "./game.service";

describe("GameService", () => {
  const service = new GameService();

  it("delegates createGame to @new-mj/core and returns a playable state", () => {
    const result = service.createGame({ rulesetId: "junk" }, 1, 0);

    expect("state" in result).toBe(true);
    if ("state" in result) {
      expect(result.state).toBeDefined();
      expect(result.events.length).toBeGreaterThan(0);
    }
  });

  it("returns an error for an unknown rulesetId", () => {
    const result = service.createGame({ rulesetId: "not-a-real-ruleset" }, 1, 0);

    expect("error" in result).toBe(true);
  });

  it("getPlayerView returns a view for a valid seat after createGame", () => {
    const created = service.createGame({ rulesetId: "junk" }, 1, 0);
    if (!("state" in created)) throw new Error("expected createGame to succeed");

    const view = service.getPlayerView(created.state, 0);

    expect(view).toBeDefined();
    expect(view?.seat).toBe(0);
  });

  it("getLegalActions returns an array for a valid seat", () => {
    const created = service.createGame({ rulesetId: "junk" }, 1, 0);
    if (!("state" in created)) throw new Error("expected createGame to succeed");

    const legal = service.getLegalActions(created.state, 0);

    expect(Array.isArray(legal)).toBe(true);
  });

  it("computeNextDealer delegates to @new-mj/core (junk rotates clockwise, D15)", () => {
    const created = service.createGame({ rulesetId: "junk" }, 1, 0);
    if (!("state" in created)) throw new Error("expected createGame to succeed");

    expect(service.computeNextDealer(created.state, 0)).toBe(1);
    expect(service.computeNextDealer(created.state, 3)).toBe(0);
  });
});
