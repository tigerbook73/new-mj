import { Injectable } from "@nestjs/common";
import type { SeatId } from "@new-mj/core";
import type { Socket } from "socket.io";

export interface ConnectionInfo {
  roomId: string;
  userId: string;
  nickname: string;
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
  private readonly roomSockets = new Map<string, Set<Socket>>();

  enter(client: Socket, roomId: string, userId: string, nickname: string): void {
    client.join(roomId);
    this.bySocketId.set(client.id, { roomId, userId, nickname });
    if (!this.roomSockets.has(roomId)) this.roomSockets.set(roomId, new Set());
    this.roomSockets.get(roomId)!.add(client);
  }

  track(client: Socket, roomId: string, userId: string, nickname: string, seat: SeatId): void {
    this.enter(client, roomId, userId, nickname);
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

  allSocketsByRoom(roomId: string): ReadonlySet<Socket> {
    return this.roomSockets.get(roomId) ?? new Set();
  }

  infosByRoom(roomId: string): ConnectionInfo[] {
    return [...(this.roomSockets.get(roomId) ?? [])]
      .map((socket) => this.bySocketId.get(socket.id))
      .filter((info): info is ConnectionInfo => info !== undefined);
  }

  /**
   * Only forgets the socket mapping — the disconnect takeover itself (评审点
   * H: mark the seat auto-piloted, keep the game moving) is RoomsGateway's
   * job, driven by RoomService.handleDisconnect(); this registry doesn't
   * know about rooms/game state, only socket↔seat plumbing.
   */
  untrack(client: Socket): void {
    const info = this.bySocketId.get(client.id);
    this.bySocketId.delete(client.id);
    if (!info) return;
    const roomSockets = this.roomSockets.get(info.roomId);
    roomSockets?.delete(client);
    if (roomSockets?.size === 0) this.roomSockets.delete(info.roomId);
    const seatMap = this.seatSockets.get(info.roomId);
    if (!seatMap) return;
    for (const [seat, socket] of seatMap) {
      if (socket.id === client.id) seatMap.delete(seat);
    }
  }
}
