import { Injectable } from "@nestjs/common";
import type { Socket } from "socket.io";

/** Identity signals from the handshake, used to arbitrate concurrent sessions — see session-mechanics.md. */
export interface SessionEntry {
  socket: Socket;
  tabId: string;
  browserId: string;
}

@Injectable()
export class SessionRegistry {
  private readonly sessions = new Map<string, SessionEntry>();

  get(userId: string): SessionEntry | undefined {
    return this.sessions.get(userId);
  }

  set(userId: string, entry: SessionEntry): void {
    this.sessions.set(userId, entry);
  }

  deleteIfSame(userId: string, socket: Socket): void {
    if (this.sessions.get(userId)?.socket === socket) this.sessions.delete(userId);
  }
}
