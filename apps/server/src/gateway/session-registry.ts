import { Injectable } from "@nestjs/common";
import type { Socket } from "socket.io";

@Injectable()
export class SessionRegistry {
  private readonly sessions = new Map<string, Socket>();

  get(userId: string): Socket | undefined {
    return this.sessions.get(userId);
  }

  set(userId: string, socket: Socket): void {
    this.sessions.set(userId, socket);
  }

  deleteIfSame(userId: string, socket: Socket): void {
    if (this.sessions.get(userId) === socket) this.sessions.delete(userId);
  }
}
