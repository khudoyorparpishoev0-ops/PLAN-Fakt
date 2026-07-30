import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import type { AuthUserDto, JwtPayload, RoleCode } from './auth.types';

type UserWithRole = {
  id: number; name: string; email: string; passwordHash: string | null;
  mustChangePassword: boolean; active: boolean; deletedAt: Date | null;
  role: { code: string };
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Аутентификация: вход по email/паролю (bcrypt), JWT access + refresh
 *  с ролью в токене, смена пароля. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private accessTtl = (process.env.JWT_ACCESS_TTL ?? '15m') as JwtSignOptions['expiresIn'];
  private refreshTtl = (process.env.JWT_REFRESH_TTL ?? '7d') as JwtSignOptions['expiresIn'];

  private toDto(u: UserWithRole): AuthUserDto {
    return {
      id: u.id, name: u.name, email: u.email,
      role: u.role.code as RoleCode,
      mustChangePassword: u.mustChangePassword,
    };
  }

  private async issueTokens(u: UserWithRole): Promise<TokenPair> {
    const base = {
      sub: u.id, email: u.email, name: u.name,
      role: u.role.code as RoleCode, mcp: u.mustChangePassword,
    };
    const accessToken = await this.jwt.signAsync({ ...base, typ: 'access' }, { expiresIn: this.accessTtl });
    const refreshToken = await this.jwt.signAsync({ ...base, typ: 'refresh' }, { expiresIn: this.refreshTtl });
    return { accessToken, refreshToken };
  }

  private unauthorized(message: string, code = 'invalid_credentials'): never {
    throw new HttpException({ code, message }, HttpStatus.UNAUTHORIZED);
  }

  private async findActiveUser(where: { id?: number; email?: string }): Promise<UserWithRole | null> {
    const user = await this.prisma.user.findFirst({
      where: { ...(where.id ? { id: where.id } : {}), ...(where.email ? { email: where.email } : {}), deletedAt: null },
      include: { role: true },
    });
    if (!user || !user.active) return null;
    return user as unknown as UserWithRole;
  }

  async login(email: string, password: string): Promise<TokenPair & { user: AuthUserDto }> {
    const user = await this.findActiveUser({ email: email.toLowerCase().trim() });
    if (!user || !user.passwordHash) this.unauthorized('Неверный email или пароль');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) this.unauthorized('Неверный email или пароль');
    return { ...(await this.issueTokens(user)), user: this.toDto(user) };
  }

  /** Обновление пары токенов. Клеймы (роль, mustChangePassword) берутся
   *  заново из БД — протухший refresh не «воскресит» старые права. */
  async refresh(refreshToken: string): Promise<TokenPair & { user: AuthUserDto }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      this.unauthorized('Refresh-токен недействителен или истёк', 'invalid_refresh_token');
    }
    if (payload.typ !== 'refresh') this.unauthorized('Передан не refresh-токен', 'invalid_refresh_token');
    const user = await this.findActiveUser({ id: payload.sub });
    if (!user) this.unauthorized('Пользователь не найден или отключён', 'invalid_refresh_token');
    return { ...(await this.issueTokens(user)), user: this.toDto(user) };
  }

  async me(userId: number): Promise<AuthUserDto> {
    const user = await this.findActiveUser({ id: userId });
    if (!user) this.unauthorized('Пользователь не найден или отключён', 'unauthorized');
    return this.toDto(user);
  }

  /** Смена пароля (в т.ч. форсированная для временных паролей из seed).
   *  Возвращает СВЕЖУЮ пару токенов — старый флаг mcp в токенах умирает сразу. */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<TokenPair & { user: AuthUserDto }> {
    const user = await this.findActiveUser({ id: userId });
    if (!user || !user.passwordHash) this.unauthorized('Пользователь не найден или отключён', 'unauthorized');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpException(
        { code: 'wrong_current_password', message: 'Текущий пароль указан неверно', field: 'currentPassword' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (currentPassword === newPassword) {
      throw new HttpException(
        { code: 'same_password', message: 'Новый пароль совпадает с текущим', field: 'newPassword' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
      include: { role: true },
    });
    const fresh = updated as unknown as UserWithRole;
    return { ...(await this.issueTokens(fresh)), user: this.toDto(fresh) };
  }
}
