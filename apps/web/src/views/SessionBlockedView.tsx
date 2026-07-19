import { useEffect } from "react";

/**
 * Dead end for SESSION_EXISTS_SAME_BROWSER: a sibling tab in this same
 * browser is already connected as this account. Deliberately does not clear
 * localStorage/Supabase session — that credential is shared by every tab of
 * this browser and the sibling tab is still using it. No form, no link back
 * to /login: reaching this page again (even after a reload of this same
 * tab, since tabId lives in sessionStorage and survives reload) is expected
 * and correct, not an error to recover from.
 */
export function SessionBlockedView() {
  useEffect(() => {
    // Best-effort only — browsers refuse to close a tab they didn't open via
    // script, so this silently does nothing for a normally opened tab.
    window.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">
          This account is already signed in on another tab in this browser. You can close this tab.
        </p>
      </div>
    </div>
  );
}
