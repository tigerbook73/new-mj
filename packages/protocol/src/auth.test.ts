import { describe, expect, it } from "vitest";
import { AuthHandshakeSchema } from "./auth.ts";

describe("AuthHandshakeSchema", () => {
  it("accepts token and protocolVersion without resume", () => {
    const payload = { token: "jwt", protocolVersion: "1.0" };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("accepts an optional resume room", () => {
    const payload = { token: "jwt", protocolVersion: "1.0", resume: { roomId: "room-1" } };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("requires token and protocolVersion to be strings", () => {
    expect(() => AuthHandshakeSchema.parse({ protocolVersion: "1.0" })).toThrow();
    expect(() => AuthHandshakeSchema.parse({ token: "jwt", protocolVersion: 1 })).toThrow();
  });
});
