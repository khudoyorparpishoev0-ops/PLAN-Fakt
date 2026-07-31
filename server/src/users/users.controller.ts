import { randomBytes } from 'node:crypto';
import {
  Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { PrismaService } from '../prisma.service';

export class CreateUserDto {
  @IsString()
  @Length(2, 100, { message: 'Имя — от 2 до 100 символов' })
  name!: string;

  @IsEmail({}, { message: 'Неверный email' })
  email!: string;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string;

  @IsIn(['admin', 'director', 'accountant'], { message: 'role: admin | director | accountant' })
  role!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string;

  @IsOptional()
  @IsIn(['admin', 'director', 'accountant'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Пользователи — только администратор (директор и бухгалтер получают 403).
 *  Создание выдаёт временный пароль ОДИН раз (в ответе); при первом входе
 *  система требует его сменить. */
@Controller('users')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(userId: number, entityId: number, action: string, newValue?: unknown) {
    await this.prisma.auditLog.create({
      data: {
        userId, entity: 'user', entityId: String(entityId), action,
        newValue: (newValue ?? undefined) as never,
      },
    });
  }

  @Get()
  @Roles('admin')
  async list() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      select: {
        id: true, name: true, email: true, phone: true, active: true,
        mustChangePassword: true, role: { select: { code: true, name: true } },
      },
    });
    return { items: users };
  }

  /** Список исполнителей для назначения задач: имя и роль, без контактов.
   *  Доступен и директору — он ставит задачи, но карточками не управляет. */
  @Get('assignees')
  @Roles('admin', 'director')
  async assignees() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: { select: { code: true, name: true } } },
    });
    return { items: users };
  }

  @Post()
  @HttpCode(201)
  @Roles('admin')
  async create(@Req() req: AuthRequest, @Body() dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpException(
        { code: 'email_taken', message: 'Пользователь с таким email уже существует', field: 'email' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const role = await this.prisma.role.findUnique({ where: { code: dto.role } });
    if (!role) {
      throw new HttpException({ code: 'validation', message: 'Роль не найдена', field: 'role' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    // Временный пароль показывается один раз; при первом входе — обязательная смена
    const tempPassword = randomBytes(9).toString('base64url');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        roleId: role.id,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
      },
      select: {
        id: true, name: true, email: true, phone: true, active: true,
        mustChangePassword: true, role: { select: { code: true, name: true } },
      },
    });
    await this.audit(req.user!.sub, user.id, 'create', { email, role: dto.role });
    return { user, tempPassword };
  }

  @Patch(':id')
  @Roles('admin')
  async update(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new HttpException({ code: 'not_found', message: 'Пользователь не найден' }, HttpStatus.NOT_FOUND);
    if (dto.active === false && id === req.user!.sub) {
      throw new HttpException(
        { code: 'self_block', message: 'Нельзя заблокировать собственную учётную запись', field: 'active' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    let roleId: number | undefined;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { code: dto.role } });
      if (!role) {
        throw new HttpException({ code: 'validation', message: 'Роль не найдена', field: 'role' }, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      roleId = role.id;
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
      },
      select: {
        id: true, name: true, email: true, phone: true, active: true,
        mustChangePassword: true, role: { select: { code: true, name: true } },
      },
    });
    await this.audit(req.user!.sub, id, 'update', dto);
    return updated;
  }
}
