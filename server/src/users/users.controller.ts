import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';

/** Список пользователей — только администратор/руководитель.
 *  Директор и бухгалтер получают 403 (проверка прав — на сервере). */
@Controller('users')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

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
}
