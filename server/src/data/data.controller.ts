import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsPositive, Matches, Min } from 'class-validator';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { DataService } from './data.service';
import { CreateOperationDto, type OperationFilters } from './operations.dto';

export class UpdateSettingsDto {
  @IsNumber({}, { message: 'kmRate — число (сомони за км)' })
  @Min(0, { message: 'Ставка не может быть отрицательной' })
  kmRate!: number;
}

export class AddRateDto {
  @IsIn(['USD', 'EUR', 'RUB', 'CNY'], { message: 'currency: USD | EUR | RUB | CNY' })
  currency!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date: YYYY-MM-DD' })
  date!: string;

  @IsPositive({ message: 'Курс должен быть больше нуля' })
  rate!: number;
}

export class ArchiveProjectDto {
  @IsBoolean()
  archived!: boolean;
}

const int = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : undefined;
};

/** Чтение данных и журнал операций. Полные суммы и журнал — только
 *  админ/директор (ТЗ, п. 8); проекты и настройки нужны всем ролям. */
@Controller()
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class DataController {
  constructor(private readonly data: DataService) {}

  /** Журнал с фильтрами (ТЗ, п. 9): type[]=in,out&confirmed=&date_from=&…&q=&limit=&offset=. */
  @Get('operations')
  @Roles('admin', 'director')
  operations(@Query() q: Record<string, string | undefined>) {
    const filters: OperationFilters = {
      type: q.type
        ? (q.type.split(',').filter((t) => ['in', 'out', 'move', 'accrual'].includes(t)) as OperationFilters['type'])
        : undefined,
      confirmed: q.confirmed === 'true' || q.confirmed === 'false' ? q.confirmed : undefined,
      date_from: q.date_from?.match(/^\d{4}-\d{2}-\d{2}$/) ? q.date_from : undefined,
      date_to: q.date_to?.match(/^\d{4}-\d{2}-\d{2}$/) ? q.date_to : undefined,
      account: int(q.account),
      counterparty: int(q.counterparty),
      article: int(q.article),
      project: int(q.project),
      amount_min: int(q.amount_min),
      amount_max: int(q.amount_max),
      q: q.q,
      limit: int(q.limit),
      offset: int(q.offset),
    };
    return this.data.operations(filters);
  }

  @Post('operations')
  @Roles('admin', 'director')
  createOperation(@Req() req: AuthRequest, @Body() dto: CreateOperationDto) {
    return this.data.createOperation(req.user!.sub, dto);
  }

  @Get('planfact')
  @Roles('admin', 'director')
  planFact() {
    return this.data.planFact();
  }

  /** Метаданные — всем ролям; суммы добавляются только админу/директору. */
  @Get('projects')
  @Roles('admin', 'director', 'accountant')
  projects(@Req() req: AuthRequest) {
    return this.data.projects(req.user!.role);
  }

  @Get('projects/:id/summary')
  @Roles('admin', 'director')
  projectSummary(@Param('id', ParseIntPipe) id: number) {
    return this.data.projectSummary(id);
  }

  @Patch('projects/:id')
  @Roles('admin', 'director')
  archiveProject(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ArchiveProjectDto) {
    return this.data.setProjectArchived(req.user!.sub, id, dto.archived);
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

  @Get('rates')
  @Roles('admin', 'director')
  rates() {
    return this.data.rates();
  }

  @Post('rates')
  @Roles('admin')
  addRate(@Req() req: AuthRequest, @Body() dto: AddRateDto) {
    return this.data.addRate(req.user!.sub, dto.currency, dto.date, dto.rate);
  }

  @Get('audit')
  @Roles('admin')
  audit(@Query('limit') limit?: string) {
    return this.data.audit(int(limit) ?? 100);
  }
}
