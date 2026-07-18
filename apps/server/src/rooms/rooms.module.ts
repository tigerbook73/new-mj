import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { CoreModule } from "../core/core.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { EventBus } from "./event-bus";
import { RoomService } from "./room.service";

@Module({
  imports: [ConfigModule, CoreModule, PersistenceModule],
  providers: [RoomService, EventBus],
  exports: [RoomService, EventBus],
})
export class RoomsModule {}
