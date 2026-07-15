import { Injectable } from "@nestjs/common";
import type { SeatId } from "@new-mj/core";
import type { Socket } from "socket.io";

export interface ConnectionInfo {
  roomId: string;
  userId: string;
}

/**
 * Socket.IO's own room feature (client.join(roomId)) already handles the
 * "broadcast to everyone in the room" case (room:playerJoined etc). This
 * registry only covers what Socket.IO can't: per-seat unicast for
 * game:snapshot/game:event, and mapping a raw socket back to {roomId,
 * userId} for messages that don't carry them in payload (identity only
 * comes from the handshake, never from payload).
 */
@Injectable()
export class ConnectionRegistry {
  private readonly bySocketId = new Map<string, ConnectionInfo>();
  private readonly seatSockets = new Map<string, Map<SeatId, Socket>>();

  track(client: Socket, roomId: string, userId: string, seat: SeatId): void {
    client.join(roomId);
    this.bySocketId.set(client.id, { roomId, userId });
    if (!this.seatSockets.has(roomId)) this.seatSockets.set(roomId, new Map());
    // !: the map was just created above if missing, so it is always present here.
    this.seatSockets.get(roomId)!.set(seat, client);
  }

  get(client: Socket): ConnectionInfo | undefined {
    return this.bySocketId.get(client.id);
  }

  socketForSeat(roomId: string, seat: SeatId): Socket | undefined {
    return this.seatSockets.get(roomId)?.get(seat);
  }

  socketsByRoom(roomId: string): ReadonlyMap<SeatId, Socket> {
    return this.seatSockets.get(roomId) ?? new Map();
  }

  /** MVP: just forgets the socket, no AFK takeover (rooms.md "❌ 断线托管", evaluation point H is future work). */
  untrack(client: Socket): void {
    const info = this.bySocketId.get(client.id);
    this.bySocketId.delete(client.id);
    if (!info) return;
    const seatMap = this.seatSockets.get(info.roomId);
    if (!seatMap) return;
    for (const [seat, socket] of seatMap) {
      if (socket.id === client.id) seatMap.delete(seat);
    }
  }
}
