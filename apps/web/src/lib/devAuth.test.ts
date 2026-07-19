import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { deriveUserId, signDevToken } from "@/lib/devAuth";

describe("deriveUserId", () => {
  it("slugifies the nickname into a deterministic pseudo-account id", () => {
    const id = deriveUserId("测试玩家 Alice!");
    expect(id).toBe("dev:alice");
  });

  it("falls back to 'player' when the nickname has no ascii-alnum characters", () => {
    const id = deriveUserId("测试玩家");
    expect(id).toBe("dev:player");
  });

  it("returns the same account id for the same nickname", () => {
    expect(deriveUserId("Alice")).toBe(deriveUserId("Alice"));
  });
});

describe("signDevToken", () => {
  it("signs a JWT whose sub claim round-trips with the same dev secret server falls back to", async () => {
    const token = await signDevToken("alice-abc123");
    const key = new TextEncoder().encode("dev-only-insecure-secret");
    const { payload } = await jwtVerify(token, key);
    expect(payload["sub"]).toBe("alice-abc123");
  });

  it("rejects verification against a different secret", async () => {
    const token = await signDevToken("alice-abc123");
    const wrongKey = new TextEncoder().encode("some-other-secret");
    await expect(jwtVerify(token, wrongKey)).rejects.toThrow();
  });
});
