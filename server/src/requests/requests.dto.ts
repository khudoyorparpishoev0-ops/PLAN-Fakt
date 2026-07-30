import { IsIn, IsInt, IsOptional, IsPositive, IsString, Length, Min } from 'class-validator';

/** Создание заявки (кабинет бухгалтера). Вид определяет обязательные поля. */
export class CreateRequestDto {
  @IsIn(['payment', 'trip', 'auto'], { message: 'kind: payment | trip | auto' })
  kind!: 'payment' | 'trip' | 'auto';

  @IsOptional()
  @IsInt()
  projectId?: number;

  /** Наименование (оплата) / цель (поездка) / категория (авто). */
  @IsString()
  @Length(3, 200, { message: 'Наименование — от 3 до 200 символов' })
  name!: string;

  /** Сумма в сомони (оплата и авто-расход), > 0, до 2 знаков. */
  @IsOptional()
  @IsPositive({ message: 'Сумма должна быть больше нуля' })
  amount?: number;

  @IsOptional()
  @IsIn(['TJS', 'USD', 'EUR', 'RUB', 'CNY'])
  currency?: string;

  /** Километры (поездка), целое > 0. */
  @IsOptional()
  @IsInt({ message: 'Км — целое число' })
  @Min(1, { message: 'Км должно быть больше нуля' })
  km?: number;

  /** Категория авто-расхода. */
  @IsOptional()
  @IsIn(['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'])
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  counterpartyName?: string;

  /** Имя приложенного файла-заглушки (реальная загрузка в MinIO — следующий этап). */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  attachment?: string;
}

/** Решение директора / перевод статуса. */
export class ChangeRequestStatusDto {
  @IsIn(['review', 'approved', 'rejected'], { message: 'status: review | approved | rejected' })
  status!: 'review' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
}
