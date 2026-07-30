import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsNumber, Min } from 'class-validator';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { DataService } from './data.service';

export class UpdateSettingsDto {
  @IsNumber({}, { message: 'kmRate — число (сомони за км)' })
  @Min(0, { message: 'Ставка не может быть отрицательной' })
  kmRate!: number;
}

/** Чтение данных. Полные суммы и журнал — только админ/директор (ТЗ, п. 8);
 *  проекты и настройки (метаданные) нужны всем ролям, в т.ч. кабинету. */
@Controller()
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class DataController {
  constructor(private readonly data: DataService) {}

  @Get('operations')
  @Roles('admin', 'director')
  operations() {
    return this.data.operations();
  }

  @Get('planfact')
  @Roles('admin', 'director')
  planFact() {
    return this.data.planFact();
  }

  @Get('projects')
  @Roles('admin', 'director', 'accountant')
  projects() {
    return this.data.projects();
  }

  @Get('dictionaries')
  @Roles('admin', 'director')
  dictionaries() {
    return this.data.dictionaries();
  }

  @Get('settings')
  @Roles('admin', 'director', 'accountant')
  settings() {
    return this.data.settings();
  }

  @Patch('settings')
  @Roles('admin')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.data.updateKmRate(dto.kmRate);
  }
}
