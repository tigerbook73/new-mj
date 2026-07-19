import { Link, useLoaderData } from "react-router";

/**
 * Pure display for the OAuth redirect landing — all connect logic lives in
 * router.tsx's authCallbackLoader, which runs before this ever mounts: a
 * successful login redirects straight to /games without this component
 * rendering at all, so by the time it does render, the loader already
 * resolved to an error (the "Signing in…" wait itself is covered by
 * RouteHydrateFallback/RootLayout's loading treatment, not this component).
 * See docs/contracts/session-mechanics.md §12.
 */
export function AuthCallbackView() {
  const { error } = useLoaderData<{ error: string }>();

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/login" className="text-sm underline">
          Back to login
        </Link>
      </div>
    </div>
  );
}
