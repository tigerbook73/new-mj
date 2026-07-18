import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import { router } from "@/router";
import { ack, connect } from "@/lib/socket";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

export function App() {
  const setRestoring = useSessionStore((state) => state.setRestoring);
  const setSocket = useSessionStore((state) => state.setSocket);
  const setUser = useSessionStore((state) => state.setUser);
  const setRoom = useSessionStore((state) => state.setRoom);
  const setView = useSessionStore((state) => state.setView);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let token: string | undefined;
      let nickname: string | undefined;
      const session = await supabase?.auth.getSession();
      if (session?.data.session) token = session.data.session.access_token;
      if (!token && import.meta.env.DEV) {
        try {
          const saved = JSON.parse(localStorage.getItem("new-mj:dev-session") ?? "null") as {
            token?: string;
            nickname?: string;
          } | null;
          token = saved?.token;
          nickname = saved?.nickname;
        } catch {
          /* stale local data */
        }
      }
      // Bail without touching the store when this closure is the StrictMode
      // dev double-invoke's throwaway first run — calling setRestoring(false)
      // here (even with no token) would flip the *shared* store to "not
      // restoring" while the real (second) invocation is still mid-connect,
      // and RequireAuth would bounce to /login out from under it.
      if (cancelled) return;
      if (!token) {
        setRestoring(false);
        return;
      }
      // A same-tab reconnect (refresh) resolves in this single attempt —
      // the server tells same tab / same browser / different browser apart
      // by tabId/browserId, so there's no client-side takeover guess left
      // to make here (see docs/contracts/session-mechanics.md).
      const result = await connect(token);
      if (!result.ok) {
        setRestoring(false);
        // A sibling tab in this browser is already connected — this tab is
        // a dead end by design, not an error to recover from (see A1 in the
        // plan: a soft SESSION_EXISTS here would mean a genuinely different
        // browser somehow has this token, which shouldn't happen; falls
        // back to the normal unauthenticated state like any other code).
        if (result.code === "SESSION_EXISTS_SAME_BROWSER") {
          window.location.assign("/session-blocked");
        }
        return;
      }
      if (cancelled) {
        setRestoring(false);
        return;
      }
      const identity = await ack<{ userId: string; nickname: string }>(
        result.socket,
        "session:identity",
        {},
      );
      if (!identity.ok) {
        setRestoring(false);
        return;
      }
      setUser(identity.data.userId, nickname ?? identity.data.nickname);
      setSocket(result.socket);
      result.socket.on("session:kicked", () => {
        result.socket.disconnect();
        useSessionStore.setState({ socket: null, room: null, view: null });
        window.location.assign("/login?kicked=1");
      });
      result.socket.on("disconnect", () => {
        if (useSessionStore.getState().socket === result.socket) {
          useSessionStore.setState({ socket: null, room: null, view: null });
          window.location.assign("/login");
        }
      });
      const roomId = localStorage.getItem("new-mj:last-room");
      if (roomId) {
        const entered = await ack<
          | {
              room: import("@new-mj/protocol").RoomInfo;
              view?: import("@new-mj/protocol").PlayerViewBase;
              seq?: number;
            }
          | import("@new-mj/protocol").RoomInfo
        >(result.socket, "room:enter", { roomId });
        if (entered.ok) {
          const data = entered.data;
          const room = "room" in data ? data.room : data;
          setRoom(room);
          if ("room" in data && data.view) setView(data.view);
        } else {
          localStorage.removeItem("new-mj:last-room");
        }
      }
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setRestoring, setSocket, setUser, setRoom, setView]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyTheme(media.matches ? "dark" : "light");
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  return <RouterProvider router={router} />;
}
