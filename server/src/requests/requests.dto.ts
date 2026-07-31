import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Length, Min, ValidateNested,
} from 'class-validator';

/** Ссылка на загруженный файл (POST /api/uploads → key). */
export class AttachmentRefDto {
  @IsString()
  @Length(1, 300)
  key!: string;

  @IsString()
  @Length(1, 200)
  fileName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  mime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}

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

  /** Загруженный файл (счёт / фото одометра / чек). */
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentRefDto)
  attachment?: AttachmentRefDto;
}

/** Правка заявки автором (ТЗ, п. 8: только «Черновик» и «Отклонено»).
 *  resend = true — сразу отправить директору заново. */
export class UpdateRequestDto {
  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsString()
  @Length(3, 200, { message: 'Наименование — от 3 до 200 символов' })
  name?: string;

  @IsOptional()
  @IsPositive({ message: 'Сумма должна быть больше нуля' })
  amount?: number;

  @IsOptional()
  @IsIn(['TJS', 'USD', 'EUR', 'RUB', 'CNY'])
  currency?: string;

  @IsOptional()
  @IsInt({ message: 'Км — целое число' })
  @Min(1, { message: 'Км должно быть больше нуля' })
  km?: number;

  @IsOptional()
  @IsIn(['Бензин', 'Ремонт', 'Мойка', 'Штраф', 'Запчасти'])
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  counterpartyName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentRefDto)
  attachment?: AttachmentRefDto;

  @IsOptional()
  @IsBoolean()
  resend?: boolean;
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
