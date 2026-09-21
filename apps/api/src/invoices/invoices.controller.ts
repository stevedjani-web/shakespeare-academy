import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { AddInvoiceLineDto } from './dto/add-invoice-line.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// FINANCE_READ (et non STUDENT_READ) : lire les paiements, factures et remises d'une famille n'est pas lire un dossier
// d'élève. Le surveillant et l'enseignant n'ont pas à connaître la situation financière (RV12, strict nécessaire).
@Controller('invoices')
@RequirePermission('FINANCE_READ')
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
