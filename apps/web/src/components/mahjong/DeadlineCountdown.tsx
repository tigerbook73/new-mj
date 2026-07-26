import { useEffect, useRef, useState } from "react";

interface DeadlineCountdownProps {
  deadline: number | null | undefined;
  /**
   * UI-only hook, fired once when the countdown reaches 0. Must never be used
   * to submit any game action — time is server-owned (root AGENTS.md law 1);
   * the server independently commits the timeout, the client only displays it.
   */
  onTimeout?: (() => void) | undefined;
}

/** Absolute-positioned claim deadline readout — a bare number, no label text. */
export function DeadlineCountdown({ deadline, onTimeout }: DeadlineCountdownProps) {
  const [now, setNow] = useState<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    if (deadline === undefined || deadline === null) return;
    // Only ever set from inside the interval callback, never synchronously
    // in the effect body — the first tick lands up to 250ms after mount, so
    // the countdown briefly renders nothing rather than a fallback string
    // (no text label was wanted here anyway).
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const remainingSeconds =
    deadline === undefined || deadline === null || now === null
      ? undefined
      : Math.max(0, Math.ceil((deadline - now) / 1_000));

  useEffect(() => {
    if (remainingSeconds === 0 && !firedRef.current) {
      firedRef.current = true;
      onTimeout?.();
    }
  }, [remainingSeconds, onTimeout]);

  if (remainingSeconds === undefined) return null;

  return (
    <span
      data-testid="action-deadline"
      aria-live="polite"
      className="absolute top-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white/90 tabular-nums"
    >
      {remainingSeconds}
    </span>
  );
}
