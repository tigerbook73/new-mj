import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { ReplayGetResponse } from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

/**
 * MVP step-through player (phase-4.5-replay.md step 4): no real tile-face
 * rendering and no per-step state reconstruction (same scope decision as
 * D19's live debug view) — just the raw event at each step plus the final
 * reconstructed view, both shown as JSON.
 */
export function ReplayView() {
  const { roomId, gameNumber } = useParams<{ roomId: string; gameNumber: string }>();
  const socket = useSessionStore((state) => state.socket)!;
  const [replay, setReplay] = useState<ReplayGetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    void ack<ReplayGetResponse>(socket, "replay:get", {
      roomId,
      gameNumber: Number(gameNumber),
    }).then((result) => {
      if (result.ok) setReplay(result.data);
      else setError(result.code);
    });
  }, [socket, roomId, gameNumber]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-6">
        <p className="text-sm text-destructive">Couldn&apos;t load replay: {error}</p>
        <Link to="/games" className="text-sm underline">
          Back to games
        </Link>
      </div>
    );
  }

  if (!replay) {
    return <div className="p-6">Loading replay…</div>;
  }

  const event = replay.events[step];

  return (
    <div className="flex min-h-screen flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium">
          Replay — game {replay.gameNumber} (seat {replay.finalView.seat})
        </h1>
        <Link to="/games" className="text-sm underline">
          Back to games
        </Link>
      </div>

      <p className="text-sm">
        Step {replay.events.length === 0 ? 0 : step + 1} of {replay.events.length}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={step >= replay.events.length - 1}
          onClick={() => setStep((current) => Math.min(replay.events.length - 1, current + 1))}
        >
          Next
        </Button>
      </div>

      {event && (
        <div>
          <h2 className="text-sm font-medium">Event at this step</h2>
          <pre className="max-w-full overflow-x-auto text-xs">{JSON.stringify(event, null, 2)}</pre>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium">Final view</h2>
        <pre className="max-w-full overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(replay.finalView, null, 2)}
        </pre>
      </div>
    </div>
  );
}
