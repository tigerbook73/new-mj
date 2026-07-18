import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import { router } from "@/router";
import { ack, connectWithTakeoverPrompt } from "@/lib/socket";
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
      if (!token || cancelled) {
        setRestoring(false);
        return;
      }
      const result = await connectWithTakeoverPrompt(token);
      if (!result.ok || cancelled) {
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
