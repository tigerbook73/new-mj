import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import { useSessionStore } from "@/store/session";

/**
 * Bridges the imperative socket lifecycle (session:kicked/disconnect
 * handlers in sessionBootstrap.ts, which only ever reset store state) to
 * react-router's data layer: when `socket` drops from present to absent with
 * no navigation having happened, force the current route's loader to re-run
 * so the same "does state match this route" check (protectedLoader in
 * router.tsx) decides where to land — the only place in the app that
 * decides "where to go" for a backend-driven state change, mirroring the
 * loader's role for navigation-driven changes. Mounted once at the app root.
 */
export function RevalidateOnSessionLoss(): null {
  const revalidator = useRevalidator();
  const socket = useSessionStore((state) => state.socket);
  const prevSocket = useRef(socket);

  useEffect(() => {
    if (prevSocket.current && !socket) revalidator.revalidate();
    prevSocket.current = socket;
  }, [socket, revalidator]);

  return null;
}
