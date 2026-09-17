import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('expenses')
@RequirePermission('CASH_CLOSE')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll(
    @Query('statut') statut?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expensesService.findAll(statut, from, to);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Post()
  @RequirePermission('EXPENSE_CREATE')
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: CurrentUserData) {
    return this.expensesService.create(dto, user.id);
  }

  @Post(':id/approve')
  @RequirePermission('EXPENSE_APPROVE')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.expensesService.approve(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('EXPENSE_APPROVE')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.expensesService.reject(id, dto, user.id);
  }
}
