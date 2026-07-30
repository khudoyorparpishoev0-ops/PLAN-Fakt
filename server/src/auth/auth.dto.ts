import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
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
