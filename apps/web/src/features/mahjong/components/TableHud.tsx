import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { Player } from "@new-mj/protocol";
import { Sidebar, SidebarContent, useSidebar } from "@/shared/ui/sidebar";
import { rulesetLabel } from "@/shared/lib/playerDisplay";
import { useAudioStore } from "@/shared/store/audio.store";
import { TableHudPanel } from "./TableHudPanel";

interface TableHudProps {
  rulesetId: string;
  roomName: string;
  gameNumber: number;
  totalGames: number;
  dealer: number;
  scores: readonly number[];
  players: readonly (Player | null)[];
  onLeave: () => void;
}

/** Left-docked sidebar, toggled by clicking the game-info logo (TableHudTrigger below) —
 * see docs/process/plan.md's HUD redesign entry. Renders as shadcn/ui's Sidebar, which
 * already collapses to a Sheet on narrow (mobile) viewports; wiring an actual edge-swipe
 * gesture is deliberately deferred, this only covers the click-triggered interaction. */
export function TableHud(props: TableHudProps) {
  const { open, setOpen } = useSidebar();
  const containerRef = useRef<HTMLDivElement>(null);
  const volume = useAudioStore((state) => state.volume);
  const muted = useAudioStore((state) => state.muted);
  const setVolume = useAudioStore((state) => state.setVolume);
  const toggleMuted = useAudioStore((state) => state.toggleMuted);

  // Desktop-only: the mobile variant renders as a Sheet (Base UI Dialog), which already
  // closes on Escape/backdrop-click for free. `open` never becomes true on mobile (that
  // branch toggles `openMobile` instead), so this effect is a no-op there.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, setOpen]);

  return (
    <div ref={containerRef}>
      <Sidebar side="left" collapsible="offcanvas">
        <SidebarContent data-testid="table-hud-panel" className="gap-4 p-4">
          <TableHudPanel
            {...props}
            volume={volume}
            muted={muted}
            onVolumeChange={setVolume}
            onToggleMuted={toggleMuted}
          />
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

/** Must render inside the same SidebarProvider as <TableHud> — see TableView.tsx, where
 * it's passed as TableBoard's `gameInfo` zone content. */
export function TableHudTrigger({ rulesetId }: { rulesetId: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      data-testid="table-hud"
      aria-label="Toggle table info"
      onClick={toggleSidebar}
      className="relative h-full w-full rounded-md transition-transform hover:scale-105 hover:ring-2 hover:ring-white/60"
    >
      <img
        src={`/ruleset-icons/icon-${rulesetId}.svg`}
        alt={rulesetLabel(rulesetId)}
        className="h-full w-full object-contain"
      />
      {/* Persistent "there's more here" affordance — a hover-only cue wouldn't reach
       * touch devices, which this trigger needs to work on once mobile lands. */}
      <div className="absolute size-[25%] right-1 top-1 flex items-center justify-center rounded-full border border-background bg-foreground/60 text-background shadow-sm">
        <ChevronDown className="w-full h-full" />
      </div>
    </button>
  );
}
