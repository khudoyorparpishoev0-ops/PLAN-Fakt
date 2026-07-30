import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { DataController } from './data/data.controller';
import { DataService } from './data/data.service';
import { ExportController } from './export/export.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads/uploads.controller';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    }),
  ],
  controllers: [
    HealthController, AuthController, UsersController, RequestsController,
    DataController, UploadsController, ExportController,
  ],
  providers: [PrismaService, AuthService, RequestsService, DataService, StorageService],
})
export class AppModule {}
