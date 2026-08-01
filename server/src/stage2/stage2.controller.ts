import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.types';
import { JwtAuthGuard, PasswordChangeGuard, Roles, RolesGuard } from '../auth/guards';
import {
  AddPaymentsDto, ClientDto, CreateDealDto, CreateDeliveryDto, CreateTaskDto, SavePlanDto,
  StockMoveDto, UpdateDealDto, UpdateGoodDto, UpdateTaskDto,
} from './stage2.dto';
import { Stage2Service } from './stage2.service';

const int = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Модули этапа 2. Задачи и уведомления доступны всем ролям (у бухгалтера —
 *  свой срез), закупки, склад, клиенты и планирование — админу и директору. */
@Controller()
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RolesGuard)
export class Stage2Controller {
  constructor(private readonly s: Stage2Service) {}

  /* ── Задачи ── */

  @Get('tasks')
  @Roles('admin', 'director', 'accountant')
  tasks(@Req() req: AuthRequest, @Query() q: Record<string, string | undefined>) {
    // Бухгалтер видит только назначенные ему задачи (ТЗ, п. 8 — права)
    const assigneeId = req.user!.role === 'accountant' ? req.user!.sub : int(q.assignee);
    return this.s.tasks({ status: q.status, assigneeId, projectId: int(q.project) });
  }

  @Post('tasks')
  @HttpCode(201)
  @Roles('admin', 'director')
  createTask(@Req() req: AuthRequest, @Body() dto: CreateTaskDto) {
    return this.s.createTask(req.user!.sub, dto);
  }

  /** Исполнитель может менять статус своей задачи, полная правка — у руководителей. */
  @Patch('tasks/:id')
  @Roles('admin', 'director', 'accountant')
  async updateTask(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    if (req.user!.role === 'accountant') {
      return this.s.updateTask(req.user!.sub, id, { status: dto.status });
    }
    return this.s.updateTask(req.user!.sub, id, dto);
  }

  @Delete('tasks/:id')
  @Roles('admin', 'director')
  removeTask(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.s.removeTask(req.user!.sub, id);
  }

  /* ── Закупки ── */

  @Get('deals')
  @Roles('admin', 'director')
  deals(@Query('status') status?: string) {
    return this.s.deals(status);
  }

  @Post('deals')
  @HttpCode(201)
  @Roles('admin', 'director')
  createDeal(@Req() req: AuthRequest, @Body() dto: CreateDealDto) {
    return this.s.createDeal(req.user!.sub, dto);
  }

  @Patch('deals/:id')
  @Roles('admin', 'director')
  updateDeal(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDealDto) {
    return this.s.updateDeal(req.user!.sub, id, dto);
  }

  @Delete('deals/:id')
  @Roles('admin', 'director')
  removeDeal(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.s.removeDeal(req.user!.sub, id);
  }

  /* ── Сделка: частичные оплаты ── */

  /** Расходные операции журнала, которые можно прикрепить к сделке. */
  @Get('deals/:id/payment-candidates')
  @Roles('admin', 'director')
  paymentCandidates(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.s.paymentCandidates(id, int(limit) ?? 50);
  }

  @Post('deals/:id/payments')
  @HttpCode(201)
  @Roles('admin', 'director')
  addPayments(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: AddPaymentsDto) {
    return this.s.addPayments(req.user!.sub, id, dto.operationIds);
  }

  @Delete('deals/:id/payments/:operationId')
  @Roles('admin', 'director')
  removePayment(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('operationId', ParseIntPipe) operationId: number,
  ) {
    return this.s.removePayment(req.user!.sub, id, operationId);
  }

  /* ── Сделка: частичные поставки ── */

  @Post('deals/:id/deliveries')
  @HttpCode(201)
  @Roles('admin', 'director')
  createDelivery(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateDeliveryDto) {
    return this.s.createDelivery(req.user!.sub, id, dto);
  }

  @Delete('deals/:id/deliveries/:deliveryId')
  @Roles('admin', 'director')
  removeDelivery(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
  ) {
    return this.s.removeDelivery(req.user!.sub, id, deliveryId);
  }

  /* ── Склад ── */

  @Get('stock')
  @Roles('admin', 'director')
  stock() {
    return this.s.stock();
  }

  @Get('stock/moves')
  @Roles('admin', 'director')
  stockMoves(@Query('good') good?: string, @Query('limit') limit?: string) {
    return this.s.stockMoves(int(good), int(limit) ?? 100);
  }

  @Post('stock/moves')
  @HttpCode(201)
  @Roles('admin', 'director')
  createStockMove(@Req() req: AuthRequest, @Body() dto: StockMoveDto) {
    return this.s.createStockMove(req.user!.sub, dto);
  }

  @Patch('stock/goods/:id')
  @Roles('admin', 'director')
  updateGood(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGoodDto) {
    return this.s.updateGood(req.user!.sub, id, dto);
  }

  /* ── Клиенты ── */

  @Get('clients')
  @Roles('admin', 'director')
  clients() {
    return this.s.clients();
  }

  @Patch('clients/:id')
  @Roles('admin', 'director')
  updateClient(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ClientDto) {
    return this.s.updateClient(req.user!.sub, id, dto);
  }

  /* ── Планирование ── */

  @Get('plans')
  @Roles('admin', 'director')
  plans(@Query('period') period?: string) {
    const p = period?.match(/^\d{4}-\d{2}(-\d{2})?$/) ? period : new Date().toISOString().slice(0, 7);
    return this.s.plans(p.length === 7 ? `${p}-01` : p);
  }

  @Post('plans')
  @Roles('admin', 'director')
  savePlan(@Req() req: AuthRequest, @Body() dto: SavePlanDto) {
    return this.s.savePlan(req.user!.sub, dto);
  }

  @Delete('plans/:id')
  @Roles('admin', 'director')
  removePlan(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.s.removePlan(req.user!.sub, id);
  }

  /* ── Уведомления ── */

  @Get('notifications')
  @Roles('admin', 'director', 'accountant')
  notifications(@Req() req: AuthRequest) {
    return this.s.notifications(req.user!);
  }

  /** Отметить прочитанным. Без keys — всю ленту пользователя. */
  @Post('notifications/read')
  @HttpCode(200)
  @Roles('admin', 'director', 'accountant')
  markRead(@Req() req: AuthRequest, @Body() body: { keys?: string[] }) {
    return this.s.markNotificationsRead(req.user!, Array.isArray(body?.keys) ? body.keys : undefined);
  }
}
