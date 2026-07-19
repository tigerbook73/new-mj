import { Module } from "@nestjs/common";
import { PersistenceService } from "./persistence.service";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService, PersistenceService],
  exports: [PersistenceService, PrismaService],
})
export class PersistenceModule {}
