import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ChangePasswordDto, LoginDto, RefreshDto } from './auth.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';
import { LoginThrottleGuard, registerFailure, registerSuccess, throttleKey } from './throttle';
import type { AuthRequest } from './auth.types';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Вход по email/паролю → access + refresh + пользователь (с ролью).
   *  Неудачные попытки считаются: после восьми подряд вход с этой пары
   *  «адрес + логин» блокируется на пять минут (см. throttle.ts). */
  @Post('login')
  @HttpCode(200)
  @UseGuards(LoginThrottleGuard)
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    const key = throttleKey(req);
    try {
      const result = await this.auth.login(dto.email, dto.password);
      registerSuccess(key);
      return result;
    } catch (e) {
      registerFailure(key);
      throw e;
    }
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
