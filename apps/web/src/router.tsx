import { createBrowserRouter, Navigate, redirect, type LoaderFunctionArgs } from "react-router";
import type { RoomEnterResponse, RoomInfo } from "@new-mj/protocol";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { RootLayout } from "@/components/RootLayout";
import { RouteHydrateFallback } from "@/components/RouteHydrateFallback";
import {
  ack,
  connectWithTakeoverPrompt,
  describeConnectError,
  unwrapRoomEnterAck,
} from "@/lib/socket";
import { ensureConnected, establishSession } from "@/lib/sessionBootstrap";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { LoginView } from "@/views/LoginView";
import { AuthCallbackView } from "@/views/AuthCallbackView";
import { SessionBlockedView } from "@/views/SessionBlockedView";
import { GamePickerView } from "@/views/GamePickerView";
import { LobbyView } from "@/views/LobbyView";
import { TableView } from "@/views/TableView";
import { ReplayView } from "@/views/ReplayView";

/**
 * /login is outside ProtectedLayout, but still checks server-truth: a
 * passively-restorable session (dev token / Supabase session already in
 * this browser) means the login form shouldn't render at all — redirect
 * straight to /games (whose own loader takes it from there). A same-browser
 * conflict is a real, meaningful outcome even from /login and must
 * propagate; every other failure just means "not logged in", the normal
 * case — swallow it and render the form.
 */
async function loginLoader() {
  try {
    await ensureConnected();
  } catch (thrown) {
    if (thrown instanceof Response && thrown.headers.get("Location") === "/session-blocked") {
      return thrown;
    }
    return null;
  }
  return redirect("/games");
}

/**
 * OAuth landing. Deliberately does not go through ensureConnected()/
 * doConnect() — the token source (Supabase session freshly established by
 * getSession()'s URL-fragment parsing) and the takeover semantics (a
 * completed OAuth login is a user gesture, eligible for the
 * confirm-to-takeover prompt) both genuinely differ from the passive-restore
 * path. Returns `{ error }` for AuthCallbackView to render on failure, or
 * redirects to /games on success — the same generic entry point every other
 * successful connect lands on, letting /games' own loader decide the final
 * destination.
 */
async function authCallbackLoader() {
  if (!supabase) {
    return { error: "Supabase is not configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY unset)" };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return { error: error?.message ?? "No session after sign-in" };
  }
  const result = await connectWithTakeoverPrompt(data.session.access_token);
  if (!result.ok) {
    if (result.code === "SESSION_EXISTS_SAME_BROWSER") return redirect("/session-blocked");
    return { error: describeConnectError(result.code) };
  }
  try {
    await establishSession(result.socket);
  } catch (thrown) {
    return { error: thrown instanceof Error ? thrown.message : "UNAUTHORIZED" };
  }
  return redirect("/games");
}

/** Where server truth says the caller currently belongs, if anywhere —
 * `room` (once a room-specific loader has actually fetched it) takes
 * precedence over the cheaper `activeRoomHint` from session:identity. */
function activeRoomTarget(): { roomId: string; phase: string } | undefined {
  const { room, activeRoomHint } = useSessionStore.getState();
  if (room) return { roomId: room.id, phase: room.phase };
  return activeRoomHint ?? undefined;
}

const targetPath = (target: { roomId: string; phase: string }): string =>
  target.phase === "in-game" ? `/room/${target.roomId}` : `/lobby/${target.roomId}`;

/**
 * The single "does state match this route" check shared by every protected
 * route, run before that route's own component ever mounts — a mismatch
 * `redirect()`s instead of rendering, so there is never a frame of wrong
 * content. `kind` distinguishes what each route needs:
 * - "generic" (/games): no roomId of its own — redirect away whenever the
 *   caller already has an active room anywhere.
 * - "lobby": no fetch of its own — LobbyView's existing mount effect already
 *   fetches a preview via room:enter without writing store.room (a room
 *   you're only browsing, not seated in, must never look like your active
 *   room); this loader only guards against an unrelated active room
 *   elsewhere stealing focus from that preview.
 * - "table": there's no "preview" concept for a live table, so unlike lobby
 *   this loader does fetch room:enter itself when store.room doesn't already
 *   match — a direct/cold landing on /room/:id must resolve who the caller
 *   is here before TableView can render anything. Not seated at all →
 *   bounce to /lobby/:id (which self-heals via its own preview fetch); no
 *   resumable view but a real seat → must be a permanently auto-piloted
 *   spectator (TableView renders that notice); otherwise the seat is simply
 *   still waiting → bounce to /lobby/:id too.
 * - "replay": only guards against an active room elsewhere stealing focus
 *   from a replay browse (product decision: the override applies uniformly
 *   to every protected route) — the actual replay:get fetch stays in
 *   ReplayView's own effect, unrelated to server-truth room restore.
 */
function protectedLoader(kind: "generic" | "lobby" | "table" | "replay") {
  return async ({ params }: LoaderFunctionArgs) => {
    await ensureConnected();

    if (kind === "generic") {
      const target = activeRoomTarget();
      if (target) return redirect(targetPath(target));
      return null;
    }

    const target = activeRoomTarget();
    if (target && target.roomId !== params.roomId) return redirect(targetPath(target));

    if (kind !== "table") return null;

    const { room, socket, userId } = useSessionStore.getState();
    if (room?.id === params.roomId) return null;

    const entered = await ack<RoomEnterResponse | RoomInfo>(socket!, "room:enter", {
      roomId: params.roomId,
    });
    if (!entered.ok) return redirect(`/games?notice=${encodeURIComponent(entered.code)}`);
    const { room: enteredRoom, view } = unwrapRoomEnterAck(entered.data);
    const mySeat = enteredRoom.players.find((player) => player?.userId === userId);
    if (!mySeat) return redirect(`/lobby/${enteredRoom.id}`);
    useSessionStore.getState().setRoom(enteredRoom);
    if (view) useSessionStore.getState().setView(view);
    if (!view && !mySeat.isAutoPiloted) return redirect(`/lobby/${enteredRoom.id}`);
    return null;
  };
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    HydrateFallback: RouteHydrateFallback,
    children: [
      { path: "/", element: <Navigate to="/login" replace /> },
      { path: "/login", loader: loginLoader, element: <LoginView /> },
      { path: "/auth/callback", loader: authCallbackLoader, element: <AuthCallbackView /> },
      // Dead end for SESSION_EXISTS_SAME_BROWSER — reached before this tab
      // ever gets a socket, no loader of its own needed.
      { path: "/session-blocked", element: <SessionBlockedView /> },
      {
        element: <ProtectedLayout />,
        children: [
          { path: "/games", loader: protectedLoader("generic"), element: <GamePickerView /> },
          { path: "/lobby/:roomId", loader: protectedLoader("lobby"), element: <LobbyView /> },
          { path: "/room/:roomId", loader: protectedLoader("table"), element: <TableView /> },
          {
            path: "/replay/:roomId/:gameNumber",
            loader: protectedLoader("replay"),
            element: <ReplayView />,
          },
        ],
      },
    ],
  },
]);
