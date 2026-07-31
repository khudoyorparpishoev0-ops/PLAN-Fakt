import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Min } from 'class-validator';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { DataService, REF_KINDS, type RefKind } from './data.service';
import { BulkOperationsDto, CreateOperationDto, type OperationFilters } from './operations.dto';

/** Проверка вида справочника из пути. */
function refKind(kind: string): RefKind {
  if (!REF_KINDS.includes(kind as RefKind)) {
    throw new HttpException(
      { code: 'validation', message: `Неизвестный справочник: ${kind}` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return kind as RefKind;
}

export class RefDto {
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
  /** Только для статей: тип и родительская статья. */
  @IsOptional() @IsIn(['income', 'expense', 'asset', 'liability', 'equity']) type?: string;
  @IsOptional() @IsInt() parentId?: number;
  /** Только для счетов: касса или расчётный счёт (карточка «Деньги»). */
  @IsOptional() @IsIn(['cash', 'bank']) kind?: string;
}

export class ProjectDto {
  @IsString() @Length(2, 200, { message: 'Название проекта — от 2 до 200 символов' }) name!: string;
  @IsOptional() @IsString() @Length(0, 200) group?: string;
  @IsOptional() @IsString() @Length(0, 200) resp?: string;
  @IsOptional() @IsIn(['plan', 'work', 'done']) status?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) start?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) end?: string;
}

export class PatchProjectDto {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsString() @Length(0, 200) group?: string;
  @IsOptional() @IsString() @Length(0, 200) resp?: string;
  @IsOptional() @IsIn(['plan', 'work', 'done']) status?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) start?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) end?: string;
}

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

  /** Массовые действия: подтвердить оплату, удалить, сменить проект. */
  @Patch('operations/bulk')
  @Roles('admin', 'director')
  bulkOperations(@Req() req: AuthRequest, @Body() dto: BulkOperationsDto) {
    return this.data.bulkOperations(req.user!.sub, dto.ids, dto.action, dto.projectId);
  }

  /** Карточка операции: валюта и курс, признак «из заявки», история. */
  @Get('operations/:id')
  @Roles('admin', 'director')
  operation(@Param('id', ParseIntPipe) id: number) {
    return this.data.operation(id);
  }

  /** План-факт за период: from/to = YYYY-MM-DD (без них — все данные). */
  @Get('planfact')
  @Roles('admin', 'director')
  planFact(@Query('from') from?: string, @Query('to') to?: string) {
    const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    return this.data.planFact(ok(from), ok(to));
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

  /** Архив (`archived`) и/или правка карточки проекта. */
  @Patch('projects/:id')
  @Roles('admin', 'director')
  async patchProject(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: PatchProjectDto) {
    if (dto.archived !== undefined) await this.data.setProjectArchived(req.user!.sub, id, dto.archived);
    const fields = ['name', 'group', 'resp', 'status', 'start', 'end'] as const;
    if (fields.some((f) => dto[f] !== undefined)) return this.data.updateProject(req.user!.sub, id, dto);
    return { id, archived: dto.archived };
  }

  @Post('projects')
  @Roles('admin', 'director')
  createProject(@Req() req: AuthRequest, @Body() dto: ProjectDto) {
    return this.data.createProject(req.user!.sub, dto);
  }

  @Get('dictionaries')
  @Roles('admin', 'director')
  dictionaries() {
    return this.data.dictionaries();
  }

  /* ── Справочники: ввод, правка, удаление (ТЗ, п. 8) ── */

  @Post('dictionaries/:kind')
  @Roles('admin', 'director')
  createRef(@Req() req: AuthRequest, @Param('kind') kind: string, @Body() dto: RefDto) {
    return this.data.createRef(req.user!.sub, refKind(kind), dto);
  }

  @Patch('dictionaries/:kind/:id')
  @Roles('admin', 'director')
  updateRef(@Req() req: AuthRequest, @Param('kind') kind: string, @Param('id', ParseIntPipe) id: number, @Body() dto: RefDto) {
    return this.data.updateRef(req.user!.sub, refKind(kind), id, dto);
  }

  @Delete('dictionaries/:kind/:id')
  @Roles('admin', 'director')
  removeRef(@Req() req: AuthRequest, @Param('kind') kind: string, @Param('id', ParseIntPipe) id: number) {
    return this.data.removeRef(req.user!.sub, refKind(kind), id);
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
