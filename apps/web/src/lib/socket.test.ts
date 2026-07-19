import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: ioMock }));

const makeSocket = (result: { ok: true } | { ok: false; code: string }): Socket => {
  const listeners = new Map<string, (value?: unknown) => void>();
  const socket = {
    once: (event: string, listener: (value?: unknown) => void) => {
      listeners.set(event, listener);
      queueMicrotask(() => {
        if (event === (result.ok ? "connect" : "connect_error")) {
          listener(result.ok ? undefined : new Error(result.code));
        }
      });
      return socket;
    },
    close: vi.fn(),
  } as unknown as Socket;
  return socket;
};

/** In-memory Storage stand-in — vitest's default (node) environment has no real localStorage/sessionStorage. */
const makeStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
};

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
  vi.stubGlobal("sessionStorage", makeStorage());
});

describe("connectWithTakeoverPrompt", () => {
  beforeEach(() => {
    ioMock.mockReset();
    vi.stubGlobal("window", { confirm: vi.fn() });
  });

  it("returns a successful first connection without prompting", async () => {
    const socket = makeSocket({ ok: true });
    ioMock.mockReturnValue(socket);
    const { connectWithTakeoverPrompt } = await import("./socket");

    const result = await connectWithTakeoverPrompt("token");

    expect(result).toEqual({ ok: true, socket });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledWith(
      "http://localhost:3000",
      expect.objectContaining({
        reconnection: false,
        auth: expect.objectContaining({ tabId: expect.any(String), browserId: expect.any(String) }),
      }),
    );
  });

  it("confirms SESSION_EXISTS and retries with takeover", async () => {
    const first = makeSocket({ ok: false, code: "SESSION_EXISTS" });
    const second = makeSocket({ ok: true });
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    vi.mocked(window.confirm).mockReturnValue(true);
    const { connectWithTakeoverPrompt } = await import("./socket");

    const result = await connectWithTakeoverPrompt("token");

    expect(result).toEqual({ ok: true, socket: second });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(ioMock).toHaveBeenLastCalledWith(
      "http://localhost:3000",
      expect.objectContaining({ auth: expect.objectContaining({ takeover: true }) }),
    );
  });

  it("does not retry when takeover is cancelled", async () => {
    const first = makeSocket({ ok: false, code: "SESSION_EXISTS" });
    ioMock.mockReturnValue(first);
    vi.mocked(window.confirm).mockReturnValue(false);
    const { connectWithTakeoverPrompt } = await import("./socket");

    const result = await connectWithTakeoverPrompt("token");

    expect(result).toEqual({ ok: false, code: "SESSION_EXISTS" });
    expect(ioMock).toHaveBeenCalledOnce();
  });

  it("never prompts for SESSION_EXISTS_SAME_BROWSER — returns it straight through", async () => {
    const first = makeSocket({ ok: false, code: "SESSION_EXISTS_SAME_BROWSER" });
    ioMock.mockReturnValue(first);
    const { connectWithTakeoverPrompt } = await import("./socket");

    const result = await connectWithTakeoverPrompt("token");

    expect(result).toEqual({ ok: false, code: "SESSION_EXISTS_SAME_BROWSER" });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledOnce();
  });
});

describe("connect", () => {
  beforeEach(() => {
    ioMock.mockReset();
  });

  it("sends the same tabId across calls (sessionStorage) but a stable browserId (localStorage)", async () => {
    ioMock.mockReturnValue(makeSocket({ ok: true }));
    const { connect } = await import("./socket");

    await connect("token");
    await connect("token");

    const [, firstOpts] = ioMock.mock.calls[0] as [string, { auth: Record<string, unknown> }];
    const [, secondOpts] = ioMock.mock.calls[1] as [string, { auth: Record<string, unknown> }];
    expect(firstOpts.auth["tabId"]).toBe(secondOpts.auth["tabId"]);
    expect(firstOpts.auth["browserId"]).toBe(secondOpts.auth["browserId"]);
  });
});

describe("unwrapRoomEnterAck", () => {
  it("preserves reconnect view and seq", async () => {
    const { unwrapRoomEnterAck } = await import("./socket");
    const room = { id: "room-1" } as import("@new-mj/protocol").RoomInfo;
    const view = {
      seat: 0,
      hand: [],
      seats: [],
      wallCount: 0,
      currentSeat: 0,
    } as import("@new-mj/protocol").PlayerViewBase;

    expect(unwrapRoomEnterAck({ room, view, seq: 42, deadline: 1234 })).toEqual({
      room,
      view,
      seq: 42,
      deadline: 1234,
    });
  });
});
