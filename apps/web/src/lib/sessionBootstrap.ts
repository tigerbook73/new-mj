import { redirect } from "react-router";
import type { Socket } from "socket.io-client";
import type { SessionIdentity } from "@new-mj/protocol";
import { clearDevSession, readDevSession } from "./devAuth";
import { ack, connect } from "./socket";
import { supabase } from "./supabase";
import { useSessionStore } from "@/store/session";

/**
 * Acks session:identity, wires session:kicked/disconnect exactly once per
 * socket lifetime (every socket that reaches an authenticated view needs
 * these, not just the passive-restore path), and populates
 * userId/nickname/socket/activeRoomHint in the store. Does not touch
 * store.room/store.view or navigate anywhere — callers (route loaders)
 * decide where the user lands, reading store.activeRoomHint/store.room.
 *
 * Throws a plain Error (not a react-router `redirect()`) on ack failure —
 * this is also called from LoginView's plain event handler, outside any
 * loader, where a thrown `redirect()` would just be an unhandled rejection.
 */
export async function establishSession(socket: Socket, nicknameOverride?: string): Promise<void> {
  const identity = await ack<SessionIdentity>(socket, "session:identity", {});
  if (!identity.ok) {
    socket.disconnect();
    throw new Error(identity.code);
  }
  socket.on("session:kicked", () => {
    socket.disconnect();
    useSessionStore.setState({ socket: null, room: null, view: null, kicked: true });
  });
  socket.on("disconnect", () => {
    if (useSessionStore.getState().socket === socket) {
      useSessionStore.setState({ socket: null, room: null, view: null });
    }
  });
  const nickname = nicknameOverride ?? identity.data.nickname;
  useSessionStore.getState().setUser(identity.data.userId, nickname);
  useSessionStore.getState().setSocket(socket);
  useSessionStore.getState().setActiveRoomHint(identity.data.activeRoom ?? null);
}

let connecting: Promise<void> | null = null;

/**
 * The single "make sure this tab has a live authenticated socket" entry
 * point, called from every protected route's loader (router.tsx) — memoized
 * so navigating between two protected routes never reconnects. Only ever
 * called from loaders: every failure path throws a react-router `redirect()`,
 * which only means anything when thrown from a loader/action.
 */
export function ensureConnected(): Promise<void> {
  const state = useSessionStore.getState();
  if (state.socket) return Promise.resolve();
  if (state.kicked) {
    // A kicked session must not silently reclaim the connection with the
    // same credentials — that would fight the takeover that just kicked it.
    // Require an explicit new login gesture instead.
    throw redirect("/login");
  }
  if (!connecting) {
    connecting = doConnect().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

async function doConnect(): Promise<void> {
  // Dev token checked first (synchronous, no network round-trip) — falls
  // back to a real Supabase session only if there's no dev token, or if the
  // dev token turns out to be stale/invalid (see below). A dev secret is
  // only trusted outside production server-side (auth.middleware.ts); this
  // is purely a client-side perf choice, not a security boundary.
  let token: string | undefined;
  let nickname: string | undefined;
  let usedDevSession = false;
  if (import.meta.env.DEV) {
    const saved = readDevSession();
    token = saved?.token;
    nickname = saved?.nickname;
    usedDevSession = !!token;
  }
  if (!token) {
    const session = await supabase?.auth.getSession();
    token = session?.data.session?.access_token;
  }
  if (!token) throw redirect("/login");

  let result = await connect(token);
  if (!result.ok && usedDevSession) {
    // The dev token failed — fall back to a real Supabase session instead of
    // giving up outright. A stale/invalid dev token must not shadow a
    // perfectly good Supabase session that also exists in this browser.
    const session = await supabase?.auth.getSession();
    if (session?.data.session) {
      usedDevSession = false;
      nickname = undefined;
      result = await connect(session.data.session.access_token);
    }
  }
  if (!result.ok) {
    if (result.code === "SESSION_EXISTS_SAME_BROWSER") throw redirect("/session-blocked");
    throw redirect("/login");
  }

  try {
    await establishSession(result.socket, nickname);
  } catch {
    throw redirect("/login");
  }
  if (usedDevSession) void supabase?.auth.signOut({ scope: "local" });
  else clearDevSession();
}
