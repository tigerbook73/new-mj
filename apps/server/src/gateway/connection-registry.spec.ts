import type { Socket } from "socket.io";
import type { SeatId } from "@new-mj/core";
import { ConnectionRegistry } from "./connection-registry";

const socket = (id: string): Socket => ({ id, join: jest.fn() }) as unknown as Socket;

describe("ConnectionRegistry", () => {
  it("vacates the old seat when the same socket re-tracks into a different seat", () => {
    // Regression: room:create seats the host at 0, then a later room:join
    // re-seat (LobbyView's "sit elsewhere" flow) tracked the new seat without
    // clearing the old one — emitSnapshots' per-seat unicast then resolved
    // *both* seats to this same socket, double-delivering game:snapshot
    // (this player's own view, plus whoever's view the stale seat now
    // belongs to) and corrupting the client's animation diff.
    const registry = new ConnectionRegistry();
    const client = socket("host");

    registry.track(client, "room-1", "user-1", "Host", 0 as SeatId);
    expect(registry.socketForSeat("room-1", 0 as SeatId)).toBe(client);

    registry.track(client, "room-1", "user-1", "Host", 3 as SeatId);

    expect(registry.socketForSeat("room-1", 3 as SeatId)).toBe(client);
    expect(registry.socketForSeat("room-1", 0 as SeatId)).toBeUndefined();
  });

  it("leaves other sockets' seats untouched", () => {
    const registry = new ConnectionRegistry();
    const host = socket("host");
    const guest = socket("guest");

    registry.track(host, "room-1", "user-1", "Host", 0 as SeatId);
    registry.track(guest, "room-1", "user-2", "Guest", 1 as SeatId);

    registry.track(host, "room-1", "user-1", "Host", 3 as SeatId);

    expect(registry.socketForSeat("room-1", 1 as SeatId)).toBe(guest);
    expect(registry.socketForSeat("room-1", 3 as SeatId)).toBe(host);
    expect(registry.socketForSeat("room-1", 0 as SeatId)).toBeUndefined();
  });

  it("re-tracking the same seat again is a no-op, not a self-eviction", () => {
    const registry = new ConnectionRegistry();
    const client = socket("host");

    registry.track(client, "room-1", "user-1", "Host", 0 as SeatId);
    registry.track(client, "room-1", "user-1", "Host", 0 as SeatId);

    expect(registry.socketForSeat("room-1", 0 as SeatId)).toBe(client);
  });
});
