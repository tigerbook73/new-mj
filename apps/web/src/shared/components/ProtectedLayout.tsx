import { Outlet, useLocation } from "react-router";
import { SignOutButton } from "@/features/auth/SignOutButton";

/**
 * Chrome-only layout for /games, /lobby/:roomId, /room/:roomId,
 * /replay/:roomId/:gameNumber. Unlike the old RequireAuth, this does not
 * gate on auth itself — each of those routes' own `loader` (router.tsx)
 * calls ensureConnected(), which redirects to /login on failure before this
 * even mounts. This component only renders chrome shared by all of them.
 *
 * SignOutButton is hidden on /room/:roomId (the live table) — signing out
 * mid-game is never a meaningful action there; leaving is handled by
 * TableHud's own Leave room flow instead.
 */
export function ProtectedLayout() {
  const { pathname } = useLocation();
  const isTableRoute = /^\/room\/[^/]+$/.test(pathname);
  return (
    <>
      {!isTableRoute && <SignOutButton />}
      <Outlet />
    </>
  );
}
