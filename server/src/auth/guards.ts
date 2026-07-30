import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthRequest, JwtPayload, RoleCode } from './auth.types';

/** Проверка Bearer access-токена; кладёт полезную нагрузку в req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      throw new HttpException({ code: 'unauthorized', message: 'Требуется вход (Bearer-токен)' }, HttpStatus.UNAUTHORIZED);
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new HttpException({ code: 'unauthorized', message: 'Токен недействителен или истёк' }, HttpStatus.UNAUTHORIZED);
    }
    if (payload.typ !== 'access') {
      throw new HttpException({ code: 'unauthorized', message: 'Ожидался access-токен' }, HttpStatus.UNAUTHORIZED);
    }
    req.user = payload;
    return true;
  }
}

/** Пока пароль временный (must_change_password) — доступ только к смене пароля. */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    if (req.user?.mcp) {
      throw new HttpException(
        { code: 'password_change_required', message: 'Сначала смените временный пароль (POST /api/auth/password)' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}

export const ROLES_KEY = 'roles';
/** Роли, которым разрешён эндпоинт. Проверка — на сервере (RolesGuard). */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

/** 403 для чужой роли. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleCode[] | undefined>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpException(
        { code: 'forbidden', message: 'Недостаточно прав для этого действия' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
