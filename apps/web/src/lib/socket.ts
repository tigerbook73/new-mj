import { io, type Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  type PlayerViewBase,
  type Reply,
  type RoomEnterResponse,
  type RoomInfo,
} from "@new-mj/protocol";
import { getBrowserId, getTabId } from "./clientIdentity";

const SERVER_URL = import.meta.env["VITE_SERVER_URL"] ?? "http://localhost:3000";

export type ConnectResult = { ok: true; socket: Socket } | { ok: false; code: string };

/**
 * Connects and resolves once the handshake either succeeds or is rejected
 * (auth.middleware.ts fires `connect_error` with the WsAuthError code as
 * `error.message` — UNAUTHORIZED/VERSION_MISMATCH/SESSION_EXISTS/
 * SESSION_EXISTS_SAME_BROWSER — before `connection` fires). Mirrors the
 * pattern apps/server's own e2e tests use.
 *
 * `tabId`/`browserId` are always sent so the server can tell same-tab
 * (refresh) apart from same-browser-other-tab apart from a different
 * browser — see docs/contracts/session-mechanics.md "账号级并发连接约束".
 */
export function connect(token: string, takeover = false): Promise<ConnectResult> {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    // Auth bootstrap owns reconnection. Automatic reconnect from an old page
    // after a server restart can register first and cause a false takeover
    // prompt on the freshly loaded page.
    reconnection: false,
    auth: {
      token,
      protocolVersion: PROTOCOL_VERSION,
      tabId: getTabId(),
      browserId: getBrowserId(),
      ...(takeover ? { takeover: true } : {}),
    },
  });

  return new Promise((resolve) => {
    socket.once("connect", () => resolve({ ok: true, socket }));
    socket.once("connect_error", (error: Error) => {
      socket.close();
      resolve({ ok: false, code: error.message });
    });
  });
}

/**
 * Used by the two explicit-gesture login paths (LoginView submit, OAuth
 * callback). `SESSION_EXISTS_SAME_BROWSER` (a sibling tab in this same
 * browser is already connected) is never prompt-eligible — the server has
 * already decided, so this returns it straight through for the caller to
 * route to the /session-blocked dead end. Only the soft `SESSION_EXISTS`
 * (a different browser holds the session) asks the user to confirm.
 */
export async function connectWithTakeoverPrompt(token: string): Promise<ConnectResult> {
  const first = await connect(token);
  if (first.ok || first.code !== "SESSION_EXISTS") return first;
  if (!window.confirm("This account is already connected. Take over the other connection?"))
    return first;
  return connect(token, true);
}

/** ack<T>: emits a command/query and resolves with the server's Reply<T> envelope. */
export function ack<T>(socket: Socket, event: string, payload: unknown): Promise<Reply<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/**
 * room:enter's ack is a bare RoomInfo (waiting/browsing) or {room, view, seq}
 * (mid-game reconnect) — this normalizes the two shapes for every caller
 * (loaders, LobbyView) instead of each repeating `"room" in data ? ... : ...`.
 */
export function unwrapRoomEnterAck(data: RoomEnterResponse | RoomInfo): {
  room: RoomInfo;
  view?: PlayerViewBase;
} {
  if (!("room" in data)) return { room: data };
  return { room: data.room, ...(data.view ? { view: data.view } : {}) };
}

/** Formats a connect() failure code for display; SESSION_EXISTS gets a friendlier message. */
export function describeConnectError(code: string): string {
  if (code === "SESSION_EXISTS") {
    return "This account is signed in on a different browser. Sign in with a different account, or try again and confirm the takeover.";
  }
  return code;
}
