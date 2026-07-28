/** Shown only for the very first cold load, while the initial route's loader
 * (ensureConnected() + room:enter, if applicable) is still in flight — there
 * is no previous page to keep visible yet. See RootLayout for the loading
 * treatment used for every subsequent navigation. */
export function RouteHydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
