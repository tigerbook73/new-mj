import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LoginForm } from "@/components/login-form";
import { SocialLoginForm } from "@/components/social-login-form";
import { connectWithTakeoverPrompt, describeConnectError } from "@/lib/socket";
import { clearDevSession, deriveUserId, signDevToken, writeDevSession } from "@/lib/devAuth";
import { establishSession } from "@/lib/sessionBootstrap";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

export function LoginView() {
  const navigate = useNavigate();
  const kicked = useSessionStore((state) => state.kicked);
  const setKicked = useSessionStore((state) => state.setKicked);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);

  const handleOAuth = async (provider: "google" | "github") => {
    if (!supabase) {
      setOauthError("Supabase is not configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY unset)");
      return;
    }
    setOauthPending(true);
    setOauthError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) {
      setOauthPending(false);
      setOauthError(signInError.message);
      return;
    }
    // On success the browser is already navigating to the provider's
    // consent screen — nothing left to do here, oauthPending stays true
    // until the page unloads.
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("Please enter a nickname");
      return;
    }

    setPending(true);
    setError(null);
    setKicked(false);
    const userId = deriveUserId(trimmed);
    const token = await signDevToken(userId);
    writeDevSession({ token, nickname: trimmed });
    const result = await connectWithTakeoverPrompt(token);

    if (!result.ok) {
      setPending(false);
      clearDevSession();
      if (result.code === "SESSION_EXISTS_SAME_BROWSER") {
        void navigate("/session-blocked");
        return;
      }
      setError(describeConnectError(result.code));
      return;
    }

    try {
      await establishSession(result.socket, trimmed);
    } catch (thrown) {
      setPending(false);
      setError(thrown instanceof Error ? thrown.message : "UNAUTHORIZED");
      return;
    }
    // Not awaited — signOut() awaits GoTrueClient's initializePromise, which
    // can be stuck retrying a dead Supabase instance; let it clean up the
    // residual session in the background instead of blocking this login.
    void supabase?.auth.signOut({ scope: "local" });
    setPending(false);
    // /games' own loader decides the actual destination (lobby/table/games)
    // from server-truth room state — this only expresses "take me into the
    // logged-in app".
    void navigate("/games", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {kicked && (
          <p className="rounded-md border border-destructive p-3 text-sm text-destructive">
            Your account was taken over by another connection.
          </p>
        )}
        <SocialLoginForm
          onGoogle={() => void handleOAuth("google")}
          onGithub={() => void handleOAuth("github")}
          pending={oauthPending}
          error={oauthError}
        />
        {import.meta.env.DEV && (
          <>
            <p className="text-center text-xs text-muted-foreground">Dev login (local only)</p>
            <LoginForm
              nickname={nickname}
              onNicknameChange={setNickname}
              onSubmit={(event) => void handleSubmit(event)}
              pending={pending}
              error={error}
            />
          </>
        )}
      </div>
    </div>
  );
}
