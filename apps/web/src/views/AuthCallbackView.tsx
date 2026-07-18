import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ack, connectWithTakeoverPrompt } from "@/lib/socket";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

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
      const result = await connectWithTakeoverPrompt(session.access_token);
      if (cancelled) return;
      if (!result.ok) {
        if (result.code === "SESSION_EXISTS_SAME_BROWSER") {
          void navigate("/session-blocked", { replace: true });
          return;
        }
        setError(
          result.code === "SESSION_EXISTS"
            ? "This account is signed in on a different browser. Sign in with a different account, or try again and confirm the takeover."
            : result.code,
        );
        return;
      }

      const identity = await ack<{ userId: string; nickname: string }>(
        result.socket,
        "session:identity",
        {},
      );
      if (!identity.ok) {
        setError(identity.code);
        return;
      }
      setUser(identity.data.userId, identity.data.nickname);
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
