import { io, type Socket } from "socket.io-client";
import { PROTOCOL_VERSION, type Reply } from "@new-mj/protocol";

const SERVER_URL = import.meta.env["VITE_SERVER_URL"] ?? "http://localhost:3000";

export type ConnectResult = { ok: true; socket: Socket } | { ok: false; code: string };

/**
 * Connects and resolves once the handshake either succeeds or is rejected
 * (auth.middleware.ts fires `connect_error` with the WsAuthError code as
 * `error.message` — UNAUTHORIZED/VERSION_MISMATCH — before `connection`
 * fires). Mirrors the pattern apps/server's own e2e tests use.
 */
export function connect(token: string): Promise<ConnectResult> {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    auth: { token, protocolVersion: PROTOCOL_VERSION },
  });

  return new Promise((resolve) => {
    socket.once("connect", () => resolve({ ok: true, socket }));
    socket.once("connect_error", (error: Error) => {
      socket.close();
      resolve({ ok: false, code: error.message });
    });
  });
}

/** ack<T>: emits a command/query and resolves with the server's Reply<T> envelope. */
export function ack<T>(socket: Socket, event: string, payload: unknown): Promise<Reply<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
