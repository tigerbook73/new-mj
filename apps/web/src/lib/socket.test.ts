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
      expect.objectContaining({ reconnection: false }),
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
});
