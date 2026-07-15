import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { CoreModule } from "./core/core.module";
import { GatewayModule } from "./gateway/gateway.module";
import { HealthModule } from "./health/health.module";
import { RoomsModule } from "./rooms/rooms.module";

@Module({
  imports: [ConfigModule, CoreModule, HealthModule, RoomsModule, GatewayModule],
})
export class AppModule {}
