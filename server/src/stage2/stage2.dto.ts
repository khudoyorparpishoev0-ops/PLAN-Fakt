import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Min, ValidateNested,
} from 'class-validator';

/* ── Задачи ─────────────────────────────────────────────────────────────── */

export class CreateTaskDto {
  @IsString() @Length(3, 200, { message: 'Название задачи — от 3 до 200 символов' })
  title!: string;

  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() projectId?: number;
  @IsOptional() @IsInt() assigneeId?: number;
  @IsOptional() @IsIn(['low', 'normal', 'high']) priority?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate: YYYY-MM-DD' }) dueDate?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(3, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() projectId?: number;
  @IsOptional() @IsInt() assigneeId?: number;
  @IsOptional() @IsIn(['low', 'normal', 'high']) priority?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string;
  @IsOptional() @IsIn(['open', 'in_progress', 'done', 'canceled']) status?: string;
}

/* ── Закупки (сделки) ───────────────────────────────────────────────────── */

export class DealPositionDto {
  @IsString() @Length(2, 200) name!: string;
  @IsOptional() @IsInt() goodId?: number;
  @IsPositive({ message: 'Количество должно быть больше нуля' }) qty!: number;
  @IsOptional() @IsString() @Length(1, 20) unit?: string;
  @IsNumber({}, { message: 'Цена — число' }) @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(0) discountPct?: number;
}

export class CreateDealDto {
  @IsString() @Length(3, 200, { message: 'Название сделки — от 3 до 200 символов' })
  title!: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsInt() counterpartyId?: number;
  @IsOptional() @IsInt() projectId?: number;
  @IsOptional() @IsString() @Length(0, 500) comment?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DealPositionDto)
  positions?: DealPositionDto[];
}

export class UpdateDealDto {
  @IsOptional() @IsString() @Length(3, 200) title?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsInt() counterpartyId?: number;
  @IsOptional() @IsInt() projectId?: number;
  @IsOptional() @IsString() @Length(0, 500) comment?: string;
  @IsOptional() @IsIn(['draft', 'active', 'done', 'canceled']) status?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DealPositionDto)
  positions?: DealPositionDto[];
}

/* ── Склад ──────────────────────────────────────────────────────────────── */

export class StockMoveDto {
  @IsInt() goodId!: number;
  @IsIn(['in', 'out'], { message: 'type: in (приход) | out (расход)' }) type!: 'in' | 'out';
  @IsPositive({ message: 'Количество должно быть больше нуля' }) qty!: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsInt() projectId?: number;
  @IsOptional() @IsString() @Length(0, 300) comment?: string;
}

export class UpdateGoodDto {
  @IsOptional() @IsString() @Length(0, 50) sku?: string;
  @IsOptional() @IsString() @Length(1, 20) unit?: string;
  @IsOptional() @IsNumber() @Min(0) minQty?: number;
}

/* ── Клиенты ────────────────────────────────────────────────────────────── */

export class ClientDto {
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsIn(['client', 'supplier', 'both']) kind?: string;
  @IsOptional() @IsString() @Length(0, 30) inn?: string;
  @IsOptional() @IsString() @Length(0, 40) phone?: string;
  @IsOptional() @IsString() @Length(0, 120) email?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
  @IsOptional() @IsString() @Length(0, 200) contact?: string;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

/* ── Планирование ───────────────────────────────────────────────────────── */

export class SavePlanDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'period: YYYY-MM-01' }) period!: string;
  @IsInt() articleId!: number;
  @IsOptional() @IsInt() projectId?: number;
  @IsNumber({}, { message: 'Сумма — число' }) @Min(0) amount!: number;
}
