import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { SignOutButton } from "@/components/SignOutButton";
import { useSessionStore } from "@/store/session";

export function RequireAuth({ children }: { children: ReactNode }) {
  const socket = useSessionStore((state) => state.socket);
  const restoring = useSessionStore((state) => state.restoring);
  if (restoring) return <div className="p-6">Restoring session…</div>;
  if (!socket) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <SignOutButton />
      {children}
    </>
  );
}
