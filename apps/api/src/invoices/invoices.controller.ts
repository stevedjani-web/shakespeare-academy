import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { AddInvoiceLineDto } from './dto/add-invoice-line.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('invoices')
@RequirePermission('STUDENT_READ')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get('by-enrollment/:enrollmentId')
  findByEnrollment(@Param('enrollmentId') enrollmentId: string) {
    return this.invoicesService.findByEnrollment(enrollmentId);
  }

  @Post(':id/lines')
  @RequirePermission('ENROLLMENT_MANAGE')
  addLine(
    @Param('id') id: string,
    @Body() dto: AddInvoiceLineDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.invoicesService.addManualLine(id, dto, user.id);
  }
}
