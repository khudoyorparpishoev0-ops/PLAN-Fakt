import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Length, Matches } from 'class-validator';

/** Фильтры журнала операций (ТЗ, п. 9): разбираются из query-строки. */
export interface OperationFilters {
  type?: ('in' | 'out' | 'move' | 'accrual')[];
  confirmed?: 'true' | 'false';
  date_from?: string;
  date_to?: string;
  account?: number;
  counterparty?: number;
  article?: number;
  project?: number;
  amount_min?: number;
  amount_max?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

/** Ручное добавление операции (формы «Новый доход / Новый расход»). */
export class CreateOperationDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date: YYYY-MM-DD' })
  date!: string;

  @IsIn(['in', 'out'], { message: 'type: in | out' })
  type!: 'in' | 'out';

  /** true — плановая операция (факт ещё не оплачен). */
  @IsOptional()
  @IsBoolean()
  isPlan?: boolean;

  @IsPositive({ message: 'Сумма должна быть больше нуля' })
  amount!: number;

  @IsOptional()
  @IsIn(['TJS', 'USD', 'EUR', 'RUB', 'CNY'])
  currency?: string;

  /** Курс к TJS (для не-TJS); если не задан — берётся последний из БД. */
  @IsOptional()
  @IsPositive()
  rate?: number;

  /** Статья (категория); создаётся, если такой ещё нет. */
  @IsString()
  @Length(2, 200, { message: 'Укажите статью (категорию)' })
  articleName!: string;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsInt()
  accountId?: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
}
