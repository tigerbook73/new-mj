import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={(event) => void handleSubmit(event)} className="flex w-64 flex-col gap-4">
        <h1 className="text-lg font-medium">Online Mahjong · Login</h1>
        <Input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Enter nickname"
          disabled={pending}
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Enter game"}
        </Button>
      </form>
    </div>
  );
}
