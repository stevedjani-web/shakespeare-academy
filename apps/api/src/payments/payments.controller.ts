import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('payments')
@RequirePermission('STUDENT_READ')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query('studentId') studentId?: string, @Query('invoiceLineId') invoiceLineId?: string) {
    if (studentId) return this.paymentsService.findAllForStudent(studentId);
    if (invoiceLineId) return this.paymentsService.findAllForInvoiceLine(invoiceLineId);
    throw new BadRequestException('Fournir studentId ou invoiceLineId.');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  @RequirePermission('PAYMENT_CREATE')
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: CurrentUserData) {
    return this.paymentsService.create(dto, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('PAYMENT_CANCEL_APPROVE')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.paymentsService.cancel(id, dto, user.id);
  }

  @Post(':id/reprint')
  @RequirePermission('PAYMENT_CREATE')
  reprint(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.paymentsService.reprint(id, user.id);
  }
}
