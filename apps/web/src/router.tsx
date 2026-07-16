import { createBrowserRouter, Navigate } from "react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginView } from "@/views/LoginView";
import { GamePickerView } from "@/views/GamePickerView";
import { LobbyView } from "@/views/LobbyView";
import { TableView } from "@/views/TableView";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginView /> },
  {
    path: "/games",
    element: (
      <RequireAuth>
        <GamePickerView />
      </RequireAuth>
    ),
  },
  {
    path: "/lobby/:rulesetId",
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
]);
