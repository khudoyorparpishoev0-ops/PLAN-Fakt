import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ChangePasswordDto, LoginDto, RefreshDto } from './auth.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';
import type { AuthRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Вход по email/паролю → access + refresh + пользователь (с ролью). */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Новая пара токенов по refresh-токену. */
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Текущий пользователь (для восстановления сессии на фронте). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthRequest) {
    return this.auth.me(req.user.sub);
  }

  /** Смена пароля (доступна и с временным паролем — это и есть форсированная смена). */
  @Post('password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }
}
