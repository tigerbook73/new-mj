import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { HealthModule } from "./health/health.module";
import { RoomsModule } from "./rooms/rooms.module";

@Module({
  imports: [CoreModule, HealthModule, RoomsModule],
})
export class AppModule {}
