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
    "falls back to 600 for %p outside test env",
    (value) => {
      process.env["NODE_ENV"] = "production";
      if (value === undefined) delete process.env["DRAW_REVEAL_DELAY_MS"];
      else process.env["DRAW_REVEAL_DELAY_MS"] = value;
      expect(new ConfigService().drawRevealDelayMs).toBe(600);
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
