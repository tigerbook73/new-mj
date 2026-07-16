import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type {
  GameSnapshot,
  RoomInfo,
  RoomPlayerJoinedEvent,
  RoomReadyChangedEvent,
} from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

export function LobbyView() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket)!;
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const setRoom = useSessionStore((state) => state.setRoom);
  const [preview, setPreview] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readyOverride, setReadyOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (room?.id === roomId) {
      return;
    }
    void ack<RoomInfo>(socket, "room:peek", { roomId }).then((result) => {
      if (result.ok) setPreview(result.data);
      else setError(result.code);
    });
  }, [room?.id, roomId, setRoom, socket]);

  useEffect(() => {
    const onPlayerJoined = (event: RoomPlayerJoinedEvent) =>
      useSessionStore.getState().applyPlayerJoined(event.seat, event.nickname, event.isBot);
    const onReadyChanged = (event: RoomReadyChangedEvent) =>
      useSessionStore.getState().applyReadyChanged(event.seat, event.ready);
    const onSnapshot = (event: GameSnapshot) => {
      useSessionStore.getState().setView(event.view);
      void navigate(`/room/${roomId}`);
    };
    const onPlayerLeft = ({ seat }: { seat: 0 | 1 | 2 | 3 }) => {
      useSessionStore.setState((state) => {
        if (!state.room || state.room.id !== roomId) return state;
        const players = [...state.room.players] as RoomInfo["players"];
        players[seat] = null;
        return { room: { ...state.room, players } };
      });
    };
    const onClosed = ({ reason }: { reason: string }) => {
      setRoom(null);
      setNotice(reason === "hostLeft" ? "The host closed this room." : "This room was closed.");
      void navigate("/games", {
        state: {
          notice: reason === "hostLeft" ? "The host closed this room." : "This room was closed.",
        },
      });
    };
    socket.on("room:playerJoined", onPlayerJoined);
    socket.on("room:readyChanged", onReadyChanged);
    socket.on("game:snapshot", onSnapshot);
    socket.on("room:playerLeft", onPlayerLeft);
    socket.on("room:closed", onClosed);
    return () => {
      socket.off("room:playerJoined", onPlayerJoined);
      socket.off("room:readyChanged", onReadyChanged);
      socket.off("game:snapshot", onSnapshot);
      socket.off("room:playerLeft", onPlayerLeft);
      socket.off("room:closed", onClosed);
    };
  }, [navigate, roomId, setRoom, socket]);

  const shownRoom = room?.id === roomId ? room : preview;
  const mySeat = shownRoom?.players.findIndex((player) => player?.userId === userId) ?? -1;
  const isHost = mySeat === 0;

  const joinSeat = async (seat: 0 | 1 | 2 | 3) => {
    setError(null);
    const result = await ack<RoomInfo>(socket, "room:join", { roomId, seat });
    if (result.ok) setRoom(result.data);
    else setError(result.code);
  };
  const addBot = async (seat: 0 | 1 | 2 | 3) => {
    setError(null);
    const result = await ack<object>(socket, "room:addBot", { seat });
    if (!result.ok) setError(result.code);
  };
  const toggleReady = async (ready: boolean) => {
    setReadyOverride(ready);
    const result = await ack(socket, "room:ready", { ready });
    if (!result.ok) setError(result.code);
  };
  const start = async () => {
    const result = await ack(socket, "room:start", {});
    if (!result.ok) setError(result.code);
  };
  const leave = async () => {
    const result = await ack(socket, "room:leave", {});
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRoom(null);
    void navigate("/games");
  };

  if (!shownRoom) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>{error ?? "Loading room…"}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-12">
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{shownRoom.rulesetId}</p>
            <h1 className="text-2xl font-semibold">{shownRoom.name}</h1>
          </div>
          <Button variant="outline" onClick={() => void leave()}>
            Leave room
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shownRoom.players.map((player, seat) => (
            <div key={seat} className="flex items-center justify-between rounded-lg border p-4">
              <span>
                {player
                  ? `${player.nickname}${player.isBot ? " (Bot)" : ""}${player.isReady ? " (Ready)" : ""}`
                  : `Seat ${seat + 1} · Empty`}
              </span>
              {!player && shownRoom.phase === "waiting" && (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => void joinSeat(seat as 0 | 1 | 2 | 3)}>
                    Sit in seat {seat + 1}
                  </Button>
                  {isHost && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void addBot(seat as 0 | 1 | 2 | 3)}
                    >
                      Add bot to seat {seat + 1}
                    </Button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
        {mySeat >= 0 && shownRoom.phase === "waiting" && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={readyOverride ?? shownRoom.players[mySeat]?.isReady ?? false}
              onChange={(event) => void toggleReady(event.target.checked)}
            />{" "}
            Ready
          </label>
        )}
        {isHost && shownRoom.phase === "waiting" && (
          <Button onClick={() => void start()}>Start game</Button>
        )}
        {(error || notice) && <p className="text-sm text-destructive">{error ?? notice}</p>}
      </section>
    </main>
  );
}
