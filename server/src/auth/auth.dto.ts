import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Пробелы по краям — след копирования из письма, а не ошибка человека
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Укажите корректный email' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Укажите пароль' })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'Передайте refreshToken' })
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Укажите текущий пароль' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Новый пароль — минимум 8 символов' })
  newPassword!: string;
}
