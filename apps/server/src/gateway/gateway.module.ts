import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "../config/config.module";
import { RoomsModule } from "../rooms/rooms.module";
import { ConnectionRegistry } from "./connection-registry";
import { RoomsGateway } from "./rooms.gateway";

@Module({
  // secret is passed per-call (configService.jwtSecret) instead of at
  // module-registration time, so JwtModule doesn't need registerAsync here.
  imports: [RoomsModule, ConfigModule, JwtModule.register({})],
  providers: [RoomsGateway, ConnectionRegistry],
})
export class GatewayModule {}
