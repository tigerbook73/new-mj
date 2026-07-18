import type { Socket } from "socket.io";
import { SessionRegistry } from "./session-registry";

const socket = (id: string): Socket => ({ id }) as Socket;

describe("SessionRegistry", () => {
  it("keeps one socket per user and does not let a stale socket delete its replacement", () => {
    const registry = new SessionRegistry();
    const oldSocket = socket("old");
    const newSocket = socket("new");

    registry.set("user-1", oldSocket);
    expect(registry.get("user-1")).toBe(oldSocket);

    registry.set("user-1", newSocket);
    registry.deleteIfSame("user-1", oldSocket);
    expect(registry.get("user-1")).toBe(newSocket);

    registry.deleteIfSame("user-1", newSocket);
    expect(registry.get("user-1")).toBeUndefined();
  });
});
