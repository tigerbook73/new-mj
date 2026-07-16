import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type {
  GameSnapshot,
  RoomInfo,
  RoomPlayerJoinedEvent,
  RoomReadyChangedEvent,
} from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

export function LobbyView() {
  const { rulesetId } = useParams<{ rulesetId: string }>();
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket);
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const setRoom = useSessionStore((state) => state.setRoom);

  const [roomIdInput, setRoomIdInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // socket 是 RequireAuth 保证非空的前置条件；这里只在渲染期间断言一次。
  const activeSocket = socket!;

  useEffect(() => {
    const onPlayerJoined = (event: RoomPlayerJoinedEvent) => {
      useSessionStore.getState().applyPlayerJoined(event.seat, event.nickname, event.isBot);
    };
    const onReadyChanged = (event: RoomReadyChangedEvent) => {
      useSessionStore.getState().applyReadyChanged(event.seat, event.ready);
    };
    const onSnapshot = (event: GameSnapshot) => {
      useSessionStore.getState().setView(event.view);
      const currentRoom = useSessionStore.getState().room;
      if (currentRoom) {
        void navigate(`/room/${currentRoom.id}`);
      }
    };
    activeSocket.on("room:playerJoined", onPlayerJoined);
    activeSocket.on("room:readyChanged", onReadyChanged);
    activeSocket.on("game:snapshot", onSnapshot);
    return () => {
      activeSocket.off("room:playerJoined", onPlayerJoined);
      activeSocket.off("room:readyChanged", onReadyChanged);
      activeSocket.off("game:snapshot", onSnapshot);
    };
  }, [activeSocket, navigate]);

  const handleCreate = async () => {
    setError(null);
    const result = await ack<RoomInfo>(activeSocket, "room:create", { rulesetId });
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRoom(result.data);
  };

  const handleJoin = async () => {
    setError(null);
    const result = await ack<RoomInfo>(activeSocket, "room:join", {
      roomId: roomIdInput.trim(),
    });
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRoom(result.data);
  };

  const handleReadyToggle = async (checked: boolean) => {
    setReady(checked);
    const result = await ack(activeSocket, "room:ready", { ready: checked });
    if (!result.ok) {
      setError(result.code);
    }
  };

  const handleStart = async () => {
    setError(null);
    const result = await ack(activeSocket, "room:start", {});
    if (!result.ok) {
      setError(result.code);
    }
  };

  const handleAddBot = async () => {
    setError(null);
    const result = await ack(activeSocket, "room:addBot", {});
    if (!result.ok) {
      setError(result.code);
    }
  };

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-lg font-medium">{rulesetId} Lobby</h1>
        <Button onClick={() => void handleCreate()}>Create room</Button>
        <div className="flex gap-2">
          <Input
            value={roomIdInput}
            onChange={(event) => setRoomIdInput(event.target.value)}
            placeholder="Room ID"
          />
          <Button onClick={() => void handleJoin()}>Join</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const mySeat = room.players.findIndex((player) => player?.userId === userId);
  const isHost = mySeat === 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-medium">Room {room.id}</h1>
      <ul className="flex flex-col gap-1">
        {room.players.map((player, seat) => (
          <li key={seat}>
            {player
              ? `Seat ${seat}: ${player.nickname}${player.isReady ? " (Ready)" : ""}`
              : `Seat ${seat}: Empty`}
          </li>
        ))}
      </ul>
      {mySeat >= 0 && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ready}
            onChange={(event) => void handleReadyToggle(event.target.checked)}
          />
          Ready
        </label>
      )}
      {isHost && room.players.some((player) => player === null) && (
        <Button variant="outline" onClick={() => void handleAddBot()}>
          Add Bot
        </Button>
      )}
      {isHost && <Button onClick={() => void handleStart()}>Start</Button>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
