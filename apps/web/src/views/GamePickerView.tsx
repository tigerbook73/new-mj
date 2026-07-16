import { useCallback, useEffect, useState } from "react";
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

export function GamePickerView() {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSessionStore((state) => state.socket)!;
  const setRoom = useSessionStore((state) => state.setRoom);
  const [rulesetId, setRulesetId] = useState<string>(RULESETS[0].id);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [search, setSearch] = useState("");
  const [roomName, setRoomName] = useState("");
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
    void ack<RoomSummary[]>(socket, "lobby:list", {
      rulesetId,
      search: search.trim() || undefined,
    }).then((result) => {
      if (result.ok) setRooms(result.data);
      else setError(result.code);
    });
  }, [rulesetId, search, socket]);

  const handleCreate = async () => {
    setError(null);
    const result = await ack<RoomInfo>(socket, "room:create", {
      rulesetId,
      name: roomName.trim() || undefined,
    });
    if (!result.ok) {
      setError(result.code);
      return;
    }
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
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    aria-label="Search rooms"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search rooms"
                  />
                  <Button variant="outline" onClick={() => void loadRooms()}>
                    Refresh
                  </Button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    aria-label="Room name"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder="Room name (optional)"
                  />
                  <Button onClick={() => void handleCreate()}>Create room</Button>
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
                        <span className="font-medium">{room.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {room.playerCount}/4 seats
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
}
