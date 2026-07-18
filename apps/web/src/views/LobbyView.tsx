import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { UserRound } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Tooltip } from "@base-ui/react/tooltip";
import type {
  GameSnapshot,
  RoomInfo,
  RoomPlayerJoinedEvent,
  RoomReadyChangedEvent,
} from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

const initials = (nickname: string): string =>
  nickname.replace(/\s/g, "").slice(0, 2).toUpperCase();
const rulesetLabel = (rulesetId: string): string =>
  rulesetId === "junk" ? "Junk Hu" : rulesetId === "bloodbattle" ? "Bloodbattle" : rulesetId;

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
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  useEffect(() => {
    if (room?.id === roomId) {
      return;
    }
    void ack<
      RoomInfo | { room: RoomInfo; view?: import("@new-mj/protocol").PlayerViewBase; seq?: number }
    >(socket, "room:enter", { roomId }).then((result) => {
      if (result.ok) {
        const data = result.data;
        const enteredRoom = "room" in data ? data.room : data;
        setPreview(enteredRoom);
        if ("room" in data && data.view) {
          useSessionStore.getState().setRoom(enteredRoom);
          useSessionStore.getState().setView(data.view);
          void navigate(`/room/${roomId}`);
        }
      } else setError(result.code);
    });
  }, [navigate, room?.id, roomId, setRoom, socket]);

  useEffect(() => {
    const onPlayerJoined = (event: RoomPlayerJoinedEvent) => {
      useSessionStore
        .getState()
        .applyPlayerJoined(event.seat, event.nickname, event.isBot, event.avatar);
      setPreview((current) => {
        if (!current || current.id !== roomId) return current;
        const players = [...current.players] as RoomInfo["players"];
        players[event.seat] = {
          userId: "",
          seatId: event.seat,
          nickname: event.nickname,
          isBot: event.isBot,
          isReady: false,
          isAutoPiloted: false,
          isDisconnected: false,
          ...(event.avatar ? { avatar: event.avatar } : {}),
        };
        return { ...current, players };
      });
    };
    const onReadyChanged = (event: RoomReadyChangedEvent) => {
      useSessionStore.getState().applyReadyChanged(event.seat, event.ready);
      setPreview((current) => {
        if (!current || current.id !== roomId) return current;
        const player = current.players[event.seat];
        if (!player) return current;
        const players = [...current.players] as RoomInfo["players"];
        players[event.seat] = { ...player, isReady: event.ready };
        return { ...current, players };
      });
    };
    const onParticipantJoined = ({
      participant,
    }: {
      participant: NonNullable<RoomInfo["participants"]>[number];
    }) => {
      const update = (current: RoomInfo | null) => {
        if (!current || current.id !== roomId) return current;
        const participants = [...(current.participants ?? [])];
        const index = participants.findIndex((item) => item.userId === participant.userId);
        if (index >= 0) participants[index] = participant;
        else participants.push(participant);
        return { ...current, participants };
      };
      useSessionStore.setState((state) => ({ room: update(state.room) }));
      setPreview(update);
    };
    const onParticipantLeft = ({ userId: participantUserId }: { userId: string }) => {
      const update = (current: RoomInfo | null) =>
        current && current.id === roomId
          ? {
              ...current,
              participants: (current.participants ?? []).filter(
                (item) => item.userId !== participantUserId,
              ),
            }
          : current;
      useSessionStore.setState((state) => ({ room: update(state.room) }));
      setPreview(update);
    };
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
      setPreview((current) => {
        if (!current || current.id !== roomId) return current;
        const players = [...current.players] as RoomInfo["players"];
        players[seat] = null;
        return { ...current, players };
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
    const onKicked = ({ reason }: { reason: string }) => {
      setRoom(null);
      setNotice(reason === "removedByHost" ? "You were removed by the host." : "You were removed.");
      void navigate("/games", {
        state: {
          notice:
            reason === "removedByHost" ? "You were removed by the host." : "You were removed.",
        },
      });
    };
    socket.on("room:playerJoined", onPlayerJoined);
    socket.on("room:readyChanged", onReadyChanged);
    socket.on("room:participantJoined", onParticipantJoined);
    socket.on("room:participantLeft", onParticipantLeft);
    socket.on("game:snapshot", onSnapshot);
    socket.on("room:playerLeft", onPlayerLeft);
    socket.on("room:closed", onClosed);
    socket.on("room:kicked", onKicked);
    return () => {
      socket.off("room:playerJoined", onPlayerJoined);
      socket.off("room:readyChanged", onReadyChanged);
      socket.off("room:participantJoined", onParticipantJoined);
      socket.off("room:participantLeft", onParticipantLeft);
      socket.off("game:snapshot", onSnapshot);
      socket.off("room:playerLeft", onPlayerLeft);
      socket.off("room:closed", onClosed);
      socket.off("room:kicked", onKicked);
    };
  }, [navigate, roomId, setRoom, socket]);

  const shownRoom = room?.id === roomId ? room : preview;
  const mySeat = shownRoom?.players.findIndex((player) => player?.userId === userId) ?? -1;
  const isHost = shownRoom?.ownerUserId === userId;
  const canStart = shownRoom?.players.every((player) => player?.isReady === true) ?? false;

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
  const removeBot = async (seat: 0 | 1 | 2 | 3) => {
    setError(null);
    const result = await ack<object>(socket, "room:removeBot", { seat });
    if (!result.ok) setError(result.code);
  };
  const removePlayer = async (seat: 0 | 1 | 2 | 3) => {
    setError(null);
    const result = await ack<object>(socket, "room:removePlayer", { seat });
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
  const leaveRoom = async () => {
    const result = await ack(socket, "room:leave", {});
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRoom(null);
    void navigate("/games");
  };
  const leave = () => {
    const hasOtherPlayers =
      mySeat >= 0 && shownRoom?.players.some((player, seat) => player !== null && seat !== mySeat);
    if (isHost && hasOtherPlayers) {
      setLeaveConfirmOpen(true);
      return;
    }
    void leaveRoom();
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
            <p className="text-sm text-muted-foreground">{rulesetLabel(shownRoom.rulesetId)}</p>
            <h1 className="text-2xl font-semibold">{shownRoom.name}</h1>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Owner: {shownRoom.ownerUserId === userId ? "ME" : shownRoom.owner}
              </p>
              <Tooltip.Root>
                <Tooltip.Trigger
                  render={
                    <span
                      className="flex cursor-help -space-x-2"
                      aria-label="Other players"
                      tabIndex={0}
                    >
                      {(shownRoom.participants ?? []).map((participant) =>
                        participant.userId !== shownRoom.ownerUserId ? (
                          <span
                            key={participant.userId}
                            className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted"
                          >
                            {participant.avatar ? (
                              <img
                                src={participant.avatar}
                                alt=""
                                className="size-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-semibold">
                                {initials(participant.nickname)}
                              </span>
                            )}
                          </span>
                        ) : null,
                      )}
                    </span>
                  }
                />
                <Tooltip.Portal>
                  <Tooltip.Positioner sideOffset={8}>
                    <Tooltip.Popup className="rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md">
                      <p className="font-medium">Other players</p>
                      <ul>
                        {(shownRoom.participants ?? []).map((participant) =>
                          participant.userId !== shownRoom.ownerUserId ? (
                            <li key={participant.userId}>{participant.nickname}</li>
                          ) : null,
                        )}
                      </ul>
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
          </div>
          <Button variant="outline" onClick={leave}>
            Leave room
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {shownRoom.players.map((player, seat) => (
            <div
              key={seat}
              data-seat={seat + 1}
              className={`grid min-h-16 grid-cols-[7rem_minmax(0,1fr)_12rem] items-center gap-4 rounded-lg border p-4 ${
                !player
                  ? "bg-muted/40"
                  : player.userId === userId
                    ? "border-primary bg-primary/10"
                    : player.isBot
                      ? "border-sky-500/30 bg-sky-500/10"
                      : "bg-background"
              }`}
            >
              <span className="font-medium">Seat {seat + 1}</span>
              <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                {player?.isBot ? (
                  <span className="font-medium">BOT</span>
                ) : player ? (
                  <>
                    <UserRound
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{player.nickname}</span>
                  </>
                ) : null}
                {player && player.isReady && (
                  <span className="text-sm text-muted-foreground">(Ready)</span>
                )}
              </span>
              <span className="flex w-48 justify-end gap-2">
                {!player && shownRoom.phase === "waiting" && (
                  <>
                    {isHost && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void addBot(seat as 0 | 1 | 2 | 3)}
                      >
                        Bot
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void joinSeat(seat as 0 | 1 | 2 | 3)}>
                      Sit
                    </Button>
                  </>
                )}
                {player?.isBot && isHost && shownRoom.phase === "waiting" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void removeBot(seat as 0 | 1 | 2 | 3)}
                  >
                    Remove
                  </Button>
                )}
                {player &&
                  !player.isBot &&
                  player.userId !== userId &&
                  isHost &&
                  shownRoom.phase === "waiting" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void removePlayer(seat as 0 | 1 | 2 | 3)}
                    >
                      Remove
                    </Button>
                  )}
              </span>
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
          <Button disabled={!canStart} onClick={() => void start()}>
            Start game
          </Button>
        )}
        {(error || notice) && <p className="text-sm text-destructive">{error ?? notice}</p>}
      </section>
      <Dialog.Root open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-background p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">Leave room?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              Other players are still in this room. Are you sure you want to leave?
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline">Cancel</Button>} />
              <Button
                variant="destructive"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  void leaveRoom();
                }}
              >
                Leave room
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
