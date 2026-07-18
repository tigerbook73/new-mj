import { createBrowserRouter, Navigate } from "react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginView } from "@/views/LoginView";
import { AuthCallbackView } from "@/views/AuthCallbackView";
import { SessionBlockedView } from "@/views/SessionBlockedView";
import { GamePickerView } from "@/views/GamePickerView";
import { LobbyView } from "@/views/LobbyView";
import { TableView } from "@/views/TableView";
import { ReplayView } from "@/views/ReplayView";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginView /> },
  // Not wrapped in RequireAuth — the user isn't "authenticated" in this
  // app's sense (no socket/userId set) until this page itself finishes
  // connecting, same as /login.
  { path: "/auth/callback", element: <AuthCallbackView /> },
  // Dead end for SESSION_EXISTS_SAME_BROWSER — not wrapped in RequireAuth,
  // reached before this tab ever gets a socket.
  { path: "/session-blocked", element: <SessionBlockedView /> },
  {
    path: "/games",
    element: (
      <RequireAuth>
        <GamePickerView />
      </RequireAuth>
    ),
  },
  {
    path: "/lobby/:roomId",
    element: (
      <RequireAuth>
        <LobbyView />
      </RequireAuth>
    ),
  },
  {
    path: "/room/:roomId",
    element: (
      <RequireAuth>
        <TableView />
      </RequireAuth>
    ),
  },
  {
    path: "/replay/:roomId/:gameNumber",
    element: (
      <RequireAuth>
        <ReplayView />
      </RequireAuth>
    ),
  },
]);
