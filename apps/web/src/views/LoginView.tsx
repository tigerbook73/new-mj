import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LoginForm } from "@/components/login-form";
import { SocialLoginForm } from "@/components/social-login-form";
import { connect } from "@/lib/socket";
import { deriveUserId, signDevToken } from "@/lib/devAuth";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

export function LoginView() {
  const navigate = useNavigate();
  const setUser = useSessionStore((state) => state.setUser);
  const setSocket = useSessionStore((state) => state.setSocket);
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
    const userId = deriveUserId(trimmed);
    const token = await signDevToken(userId);
    const result = await connect(token);
    setPending(false);

    if (!result.ok) {
      setError(result.code);
      return;
    }

    setUser(userId, trimmed);
    setSocket(result.socket);
    void navigate("/games");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
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
