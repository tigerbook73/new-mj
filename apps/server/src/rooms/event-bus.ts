import { EventEmitter } from "node:events";
import { Injectable } from "@nestjs/common";
import type { RoomEventMap } from "./room.events";

/**
 * Thin typed wrapper over Node's EventEmitter (MVP: in-process only; phase 4
 * can swap the internals for Redis/Bull without touching RoomService).
 */
@Injectable()
export class EventBus {
  private readonly emitter = new EventEmitter();

  emit<TEvent extends keyof RoomEventMap>(event: TEvent, payload: RoomEventMap[TEvent]): void {
    this.emitter.emit(event, payload);
  }

  on<TEvent extends keyof RoomEventMap>(
    event: TEvent,
    listener: (payload: RoomEventMap[TEvent]) => void,
  ): void {
    this.emitter.on(event, listener);
  }
}
