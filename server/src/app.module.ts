import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CurrencyService } from './currency.service';
import { DataController } from './data/data.controller';
import { DataService } from './data/data.service';
import { ExportController } from './export/export.controller';
import { ExportService } from './export/export.service';
import { ExportScheduleService } from './export/schedule.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { Stage2Controller } from './stage2/stage2.controller';
import { Stage2Service } from './stage2/stage2.service';
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
    DataController, UploadsController, ExportController, Stage2Controller,
  ],
  providers: [
    PrismaService, AuthService, RequestsService, DataService, StorageService, Stage2Service,
    ExportService, ExportScheduleService, CurrencyService,
  ],
})
export class AppModule {}
