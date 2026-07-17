import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { connect } from "@/lib/socket";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

/** Mirrors apps/server's auth.middleware.ts deriveNickname — same fallback order. */
function deriveNickname(user: { email?: string; user_metadata: Record<string, unknown> }): string {
  const metaName = user.user_metadata["full_name"] ?? user.user_metadata["name"];
  if (typeof metaName === "string" && metaName.trim()) return metaName;
  return user.email?.split("@")[0] ?? "player";
}

/**
 * Lands here after signInWithOAuth's redirect (LoginView) completes —
 * Supabase's client auto-parses the URL fragment on load (default
 * detectSessionInUrl), so by the time getSession() resolves the session is
 * already established; this view just picks it up and finishes the same
 * connect()+navigate flow LoginView's dev nickname path already does.
 */
export function AuthCallbackView() {
  const navigate = useNavigate();
  const setUser = useSessionStore((state) => state.setUser);
  const setSocket = useSessionStore((state) => state.setSocket);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!supabase) {
        setError("Supabase is not configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY unset)");
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !data.session) {
        setError(sessionError?.message ?? "No session after sign-in");
        return;
      }

      const { session } = data;
      const result = await connect(session.access_token);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.code);
        return;
      }

      setUser(session.user.id, deriveNickname(session.user));
      setSocket(result.socket);
      void navigate("/games", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, setSocket, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {error ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Link to="/login" className="text-sm underline">
            Back to login
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Signing in…</p>
      )}
    </div>
  );
}
