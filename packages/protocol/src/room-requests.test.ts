import { describe, expect, it } from "vitest";
import {
  GameActionRequestSchema,
  LobbyListRequestSchema,
  RoomAddBotRequestSchema,
  RoomCreateRequestSchema,
  RoomEnterRequestSchema,
  RoomJoinRequestSchema,
  RoomPeekRequestSchema,
  RoomReadyRequestSchema,
  RoomRemoveBotRequestSchema,
  RoomRemovePlayerRequestSchema,
  RoomStartRequestSchema,
} from "./room-requests.ts";

describe("room creation and entry requests", () => {
  it("allows optional room creation fields", () => {
    expect(RoomCreateRequestSchema.parse({ rulesetId: "junk" })).toEqual({ rulesetId: "junk" });
    expect(RoomCreateRequestSchema.parse({ rulesetId: "junk", name: "Alice's room" })).toEqual({
      rulesetId: "junk",
      name: "Alice's room",
    });
    expect(() =>
      RoomCreateRequestSchema.parse({ rulesetId: "junk", sessionFormat: "best-of-5" }),
    ).toThrow();
  });

  it("validates roomId and optional or required seat fields", () => {
    expect(RoomJoinRequestSchema.parse({ roomId: "room-1", seat: 2 })).toEqual({
      roomId: "room-1",
      seat: 2,
    });
    expect(() => RoomJoinRequestSchema.parse({})).toThrow();
    expect(() => RoomJoinRequestSchema.parse({ roomId: "room-1", seat: 4 })).toThrow();
    expect(RoomEnterRequestSchema.parse({ roomId: "room-1" })).toEqual({ roomId: "room-1" });
    expect(RoomPeekRequestSchema.parse({ roomId: "room-1" })).toEqual({ roomId: "room-1" });
  });
});

describe("room control requests", () => {
  it("validates ready, bot, player removal, and start requests", () => {
    expect(RoomReadyRequestSchema.parse({ ready: true })).toEqual({ ready: true });
    expect(RoomAddBotRequestSchema.parse({})).toEqual({});
    expect(RoomAddBotRequestSchema.parse({ seat: 1 })).toEqual({ seat: 1 });
    expect(RoomRemoveBotRequestSchema.parse({ seat: 1 })).toEqual({ seat: 1 });
    expect(RoomRemovePlayerRequestSchema.parse({ seat: 2 })).toEqual({ seat: 2 });
    expect(RoomStartRequestSchema.parse({})).toEqual({});
    expect(() => RoomReadyRequestSchema.parse({ ready: "yes" })).toThrow();
    expect(() => RoomRemoveBotRequestSchema.parse({})).toThrow();
  });
});

describe("LobbyListRequestSchema and GameActionRequestSchema", () => {
  it("validates lobby filters", () => {
    expect(LobbyListRequestSchema.parse({ rulesetId: "junk", search: "alice" })).toEqual({
      rulesetId: "junk",
      search: "alice",
    });
    expect(() => LobbyListRequestSchema.parse({})).toThrow();
  });

  it("leaves ruleset-private actions opaque", () => {
    const payload = { action: { type: "discard", tile: 12 } };
    expect(GameActionRequestSchema.parse(payload)).toEqual(payload);
  });
});
