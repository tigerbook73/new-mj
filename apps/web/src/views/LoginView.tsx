import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { LoginForm } from "@/components/login-form";
import { connect } from "@/lib/socket";
import { deriveUserId, signDevToken } from "@/lib/devAuth";
import { useSessionStore } from "@/store/session";

export function LoginView() {
  const navigate = useNavigate();
  const setUser = useSessionStore((state) => state.setUser);
  const setSocket = useSessionStore((state) => state.setSocket);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      <LoginForm
        className="w-full max-w-sm"
        nickname={nickname}
        onNicknameChange={setNickname}
        onSubmit={(event) => void handleSubmit(event)}
        pending={pending}
        error={error}
      />
    </div>
  );
}
