import { describe, expect, it } from "vitest";
import { AuthHandshakeSchema } from "./auth.ts";

describe("AuthHandshakeSchema", () => {
  it("accepts token, protocolVersion, tabId and browserId without resume", () => {
    const payload = { token: "jwt", protocolVersion: "1.0", tabId: "tab-1", browserId: "browser-1" };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("accepts an optional takeover flag", () => {
    const payload = {
      token: "jwt",
      protocolVersion: "1.0",
      tabId: "tab-1",
      browserId: "browser-1",
      takeover: true,
    };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("requires token, protocolVersion, tabId and browserId to be strings", () => {
    expect(() =>
      AuthHandshakeSchema.parse({ protocolVersion: "1.0", tabId: "tab-1", browserId: "browser-1" }),
    ).toThrow();
    expect(() =>
      AuthHandshakeSchema.parse({
        token: "jwt",
        protocolVersion: 1,
        tabId: "tab-1",
        browserId: "browser-1",
      }),
    ).toThrow();
    expect(() =>
      AuthHandshakeSchema.parse({ token: "jwt", protocolVersion: "1.0", browserId: "browser-1" }),
    ).toThrow();
    expect(() =>
      AuthHandshakeSchema.parse({ token: "jwt", protocolVersion: "1.0", tabId: "tab-1" }),
    ).toThrow();
  });
});
