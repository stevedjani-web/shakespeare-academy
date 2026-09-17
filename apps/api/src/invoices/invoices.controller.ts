import { Controller, Get, Param } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

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
}
