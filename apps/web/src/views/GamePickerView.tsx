import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, RefreshCw } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import type { RoomInfo, RoomSummary } from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

const RULESETS = [
  { id: "junk", label: "Junk Hu" },
  { id: "bloodbattle", label: "Bloodbattle" },
] as const;

const formatCreatedAt = (timestamp: number) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
};

export function GamePickerView() {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSessionStore((state) => state.socket)!;
  const setRoom = useSessionStore((state) => state.setRoom);
  const [rulesetId, setRulesetId] = useState<string>(RULESETS[0].id);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [search, setSearch] = useState("");
  const [roomName, setRoomName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationNotice =
    typeof location.state === "object" && location.state !== null && "notice" in location.state
      ? String(location.state.notice)
      : null;

  const loadRooms = useCallback(async () => {
    const result = await ack<RoomSummary[]>(socket, "lobby:list", {
      rulesetId,
      search: search.trim() || undefined,
    });
    if (result.ok) setRooms(result.data);
    else setError(result.code);
  }, [rulesetId, search, socket]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void ack<RoomSummary[]>(socket, "lobby:list", {
        rulesetId,
        search: search.trim() || undefined,
      }).then((result) => {
        if (result.ok) setRooms(result.data);
        else setError(result.code);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [rulesetId, search, socket]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setError("Please enter a room name");
      return;
    }
    setError(null);
    const result = await ack<RoomInfo>(socket, "room:create", {
      rulesetId,
      name: trimmedName,
    });
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setCreateOpen(false);
    setRoomName("");
    setRoom(result.data);
    void navigate(`/lobby/${result.data.id}`);
  };

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header>
          <p className="text-sm text-muted-foreground">Online Mahjong</p>
          <h1 className="text-3xl font-semibold tracking-tight">Game lobby</h1>
          {navigationNotice && (
            <p className="mt-2 text-sm text-muted-foreground">{navigationNotice}</p>
          )}
        </header>
        <Tabs value={rulesetId} onValueChange={(value) => setRulesetId(value)}>
          <TabsList aria-label="Game variants">
            {RULESETS.map((ruleset) => (
              <TabsTrigger key={ruleset.id} value={ruleset.id}>
                {ruleset.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {RULESETS.map((ruleset) => (
            <TabsContent key={ruleset.id} value={ruleset.id} className="mt-6">
              <section className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Search rooms"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search rooms"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="outline"
                    className="size-8 p-0 sm:h-8 sm:w-auto sm:px-2.5"
                    aria-label="Refresh"
                    title="Refresh"
                    onClick={() => void loadRooms()}
                  >
                    <RefreshCw />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                  <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
                    <Dialog.Trigger
                      render={
                        <Button
                          className="size-8 p-0 sm:h-8 sm:w-auto sm:px-2.5"
                          aria-label="Create room"
                          title="Create room"
                        >
                          <Plus />
                          <span className="hidden sm:inline">Create room</span>
                        </Button>
                      }
                    />
                    <Dialog.Portal>
                      <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
                      <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-background p-6 shadow-xl">
                        <div>
                          <Dialog.Title className="text-lg font-semibold">
                            Create a room
                          </Dialog.Title>
                          <Dialog.Description className="text-sm text-muted-foreground">
                            Choose a name for your new room.
                          </Dialog.Description>
                        </div>
                        <form
                          className="flex flex-col gap-4"
                          onSubmit={(event) => void handleCreate(event)}
                        >
                          <label
                            className="flex flex-col gap-2 text-sm font-medium"
                            htmlFor="new-room-name"
                          >
                            Room name
                            <Input
                              id="new-room-name"
                              value={roomName}
                              onChange={(event) => setRoomName(event.target.value)}
                              autoFocus
                            />
                          </label>
                          {error && <p className="text-sm text-destructive">{error}</p>}
                          <div className="flex justify-end gap-2">
                            <Dialog.Close
                              render={
                                <Button type="button" variant="outline">
                                  Cancel
                                </Button>
                              }
                            />
                            <Button type="submit">Create room</Button>
                          </div>
                        </form>
                      </Dialog.Popup>
                    </Dialog.Portal>
                  </Dialog.Root>
                </div>
                <div className="flex flex-col gap-2" aria-label="Room list">
                  {rooms.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No open rooms found.
                    </p>
                  ) : (
                    rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        className="flex items-center justify-between rounded-lg border p-4 text-left hover:bg-muted"
                        onClick={() => void navigate(`/lobby/${room.id}`)}
                      >
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">{room.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {room.creator || "Unknown creator"} · {formatCreatedAt(room.createdAt)}
                          </span>
                        </span>
                        <span className="ml-4 shrink-0 text-sm text-muted-foreground">
                          {room.playerCount}/4 seats
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {error && !createOpen && <p className="text-sm text-destructive">{error}</p>}
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
}
