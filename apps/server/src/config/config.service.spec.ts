import { ConfigService } from "./config.service";

describe("ConfigService.claimTimeoutMs", () => {
  const original = process.env["CLAIM_TIMEOUT_MS"];

  afterEach(() => {
    if (original === undefined) delete process.env["CLAIM_TIMEOUT_MS"];
    else process.env["CLAIM_TIMEOUT_MS"] = original;
  });

  it.each([undefined, "", "nope", "Infinity", "1.5", "0", "-1"])(
    "falls back to 5000 for %p",
    (value) => {
      if (value === undefined) delete process.env["CLAIM_TIMEOUT_MS"];
      else process.env["CLAIM_TIMEOUT_MS"] = value;
      expect(new ConfigService().claimTimeoutMs).toBe(5_000);
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
