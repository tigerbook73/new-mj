import { describe, expect, it } from "vitest";
import { buildStatusBadges } from "./statusBadges";

describe("buildStatusBadges", () => {
  it("returns no badges when none of the hangzhou-only flags are set (junk/bloodbattle)", () => {
    expect(buildStatusBadges({})).toEqual([]);
  });

  it("shows only 爆头, not 听牌, when both are true (爆头 implies 听牌)", () => {
    const badges = buildStatusBadges({ isTingpai: true, isBaotou: true });
    expect(badges.map((badge) => badge.key)).toEqual(["baotou"]);
  });

  it("shows 听牌 alone when not baotou", () => {
    const badges = buildStatusBadges({ isTingpai: true, isBaotou: false });
    expect(badges.map((badge) => badge.key)).toEqual(["tingpai"]);
  });

  it("shows 财飘 independently alongside either 听牌 or 爆头", () => {
    const withTingpai = buildStatusBadges({ isTingpai: true, isCaipiao: true });
    expect(withTingpai.map((badge) => badge.key)).toEqual(["tingpai", "caipiao"]);

    const withBaotou = buildStatusBadges({ isBaotou: true, isCaipiao: true });
    expect(withBaotou.map((badge) => badge.key)).toEqual(["baotou", "caipiao"]);
  });
});
