import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import { ChangeRequestStatusDto, CreateRequestDto } from './requests.dto';
import { RequestsService } from './requests.service';

/** Заявки кабинета (ТЗ, п. 9): POST /api/requests · PATCH /api/requests/:id/status
 *  (директор) · GET /api/requests?kind=&status=. Права проверяются на сервере:
 *  чужая роль получает 403. */
@Controller('requests')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  /** Бухгалтер — только свои; админ и директор — все. */
  @Get()
  @Roles('accountant', 'director', 'admin')
  list(@Req() req: AuthRequest, @Query('kind') kind?: string, @Query('status') status?: string) {
    return this.requests.list(req.user!, { kind, status });
  }

  @Post()
  @HttpCode(201)
  @Roles('accountant')
  create(@Req() req: AuthRequest, @Body() dto: CreateRequestDto) {
    return this.requests.create(req.user!, dto);
  }

  @Patch(':id/status')
  @Roles('director', 'admin')
  changeStatus(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ChangeRequestStatusDto) {
    return this.requests.changeStatus(req.user!, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('accountant')
  async remove(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    await this.requests.remove(req.user!, id);
  }
}
