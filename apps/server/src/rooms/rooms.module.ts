import { Module } from "@nestjs/common";
import { CoreModule } from "../core/core.module";
import { EventBus } from "./event-bus";
import { RoomService } from "./room.service";

@Module({
  imports: [CoreModule],
  providers: [RoomService, EventBus],
  exports: [RoomService, EventBus],
})
export class RoomsModule {}
