import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { SignOutButton } from "@/components/SignOutButton";
import { useSessionStore } from "@/store/session";

export function RequireAuth({ children }: { children: ReactNode }) {
  const socket = useSessionStore((state) => state.socket);
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
