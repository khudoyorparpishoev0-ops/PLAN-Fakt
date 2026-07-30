import type { Request } from 'express';

export type RoleCode = 'admin' | 'director' | 'accountant';

/** Полезная нагрузка JWT (access и refresh различаются полем typ). */
export interface JwtPayload {
  sub: number;
  email: string;
  name: string;
  role: RoleCode;
  /** must_change_password на момент выпуска токена */
  mcp: boolean;
  typ: 'access' | 'refresh';
}

/** Запрос с аутентифицированным пользователем (заполняет JwtAuthGuard). */
export interface AuthRequest extends Request {
  user: JwtPayload;
}

/** Публичное представление пользователя в ответах API. */
export interface AuthUserDto {
  id: number;
  name: string;
  email: string;
  role: RoleCode;
  mustChangePassword: boolean;
}
