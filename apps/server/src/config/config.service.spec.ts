import { ConfigService } from "./config.service";

describe("ConfigService.claimTimeoutMs", () => {
  const original = process.env["CLAIM_TIMEOUT_MS"];

  afterEach(() => {
    if (original === undefined) delete process.env["CLAIM_TIMEOUT_MS"];
    else process.env["CLAIM_TIMEOUT_MS"] = original;
  });

  it.each([undefined, "", "nope", "Infinity", "1.5", "0", "-1"])(
    "falls back to 20000 for %p",
    (value) => {
      if (value === undefined) delete process.env["CLAIM_TIMEOUT_MS"];
      else process.env["CLAIM_TIMEOUT_MS"] = value;
      expect(new ConfigService().claimTimeoutMs).toBe(20_000);
    },
  );

  it.each([
    ["25", 25],
    ["3600000", 3_600_000],
  ])("accepts %s as %i", (value, expected) => {
    process.env["CLAIM_TIMEOUT_MS"] = value;
    expect(new ConfigService().claimTimeoutMs).toBe(expected);
  });
});

describe("ConfigService.drawRevealDelayMs", () => {
  const originalNodeEnv = process.env["NODE_ENV"];
  const originalValue = process.env["DRAW_REVEAL_DELAY_MS"];

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = originalNodeEnv;
    if (originalValue === undefined) delete process.env["DRAW_REVEAL_DELAY_MS"];
    else process.env["DRAW_REVEAL_DELAY_MS"] = originalValue;
  });

  it("is always 0 under NODE_ENV=test, regardless of the env var", () => {
    process.env["NODE_ENV"] = "test";
    process.env["DRAW_REVEAL_DELAY_MS"] = "9999";
    expect(new ConfigService().drawRevealDelayMs).toBe(0);
  });

  it.each([undefined, "", "nope", "Infinity", "1.5", "-1"])(
    "falls back to 1000 for %p outside test env",
    (value) => {
      process.env["NODE_ENV"] = "production";
      if (value === undefined) delete process.env["DRAW_REVEAL_DELAY_MS"];
      else process.env["DRAW_REVEAL_DELAY_MS"] = value;
      expect(new ConfigService().drawRevealDelayMs).toBe(1_000);
    },
  );

  it.each([
    ["0", 0],
    ["1500", 1_500],
  ])("accepts %s as %i outside test env", (value, expected) => {
    process.env["NODE_ENV"] = "production";
    process.env["DRAW_REVEAL_DELAY_MS"] = value;
    expect(new ConfigService().drawRevealDelayMs).toBe(expected);
  });
});

describe("ConfigService.allowDebugOmniscient", () => {
  const originalNodeEnv = process.env["NODE_ENV"];
  const originalFlag = process.env["ALLOW_DEBUG_OMNISCIENT"];

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = originalNodeEnv;
    if (originalFlag === undefined) delete process.env["ALLOW_DEBUG_OMNISCIENT"];
    else process.env["ALLOW_DEBUG_OMNISCIENT"] = originalFlag;
  });

  it("requires an explicit non-production opt-in", () => {
    process.env["NODE_ENV"] = "test";
    delete process.env["ALLOW_DEBUG_OMNISCIENT"];
    expect(new ConfigService().allowDebugOmniscient).toBe(false);

    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    expect(new ConfigService().allowDebugOmniscient).toBe(true);
  });

  it("never enables hidden tile delivery in production", () => {
    process.env["NODE_ENV"] = "production";
    process.env["ALLOW_DEBUG_OMNISCIENT"] = "true";
    expect(new ConfigService().allowDebugOmniscient).toBe(false);
  });
});
