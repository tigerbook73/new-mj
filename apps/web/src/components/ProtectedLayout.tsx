import { Outlet } from "react-router";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Chrome-only layout for /games, /lobby/:roomId, /room/:roomId,
 * /replay/:roomId/:gameNumber. Unlike the old RequireAuth, this does not
 * gate on auth itself — each of those routes' own `loader` (router.tsx)
 * calls ensureConnected(), which redirects to /login on failure before this
 * even mounts. This component only renders chrome shared by all of them.
 */
export function ProtectedLayout() {
  return (
    <>
      <SignOutButton />
      <Outlet />
    </>
  );
}
