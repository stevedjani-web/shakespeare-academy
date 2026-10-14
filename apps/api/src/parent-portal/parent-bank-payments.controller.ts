import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../auth/decorators/public.decorator';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { DeclareBankPaymentDto } from '../bank-payments/dto/bank-payments.dto';
import { MAX_BANK_PROOFS } from '../bank-payments/bank-payment-files';
import { MAX_EXPENSE_FILE_BYTES } from '../expenses/expense-files';
import { onlyFields, parsePayload } from '../common/multipart-payload';
import { ParentAuthGuard, type ParentIdentity } from './parent-auth.guard';

type ParentRequest = Request & { parent: ParentIdentity };

/**
 * Paiement par banque vu par le responsable : il déclare un virement, un dépôt ou un chèque avec sa preuve, pour tout ou
 * partie des tranches de SES enfants (une preuve peut couvrir plusieurs tranches et plusieurs enfants). Rien n'est un
 * paiement avant la confirmation du crédit et la validation du secrétariat.
 */
@Public()
@UseGuards(ParentAuthGuard)
@Controller('portal/bank-payments')
export class ParentBankPaymentsController {
  constructor(private readonly claims: BankPaymentsService) {}

  @Get('context')
  context(@Req() req: ParentRequest) {
    return this.claims.portalContext(req.parent.guardianId);
  }

  @Get()
  list(@Req() req: ParentRequest) {
    return this.claims.portalList(req.parent.guardianId);
  }

  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        files: MAX_BANK_PROOFS + 1,
        fileSize: MAX_EXPENSE_FILE_BYTES,
        fields: 10,
        parts: MAX_BANK_PROOFS + 11,
      },
    }),
  )
  async declare(
    @Req() req: ParentRequest,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const dto = await parsePayload(DeclareBankPaymentDto, body);
    const proofs = onlyFields(files, 'preuve').map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
    }));
    return this.claims.declareForParent(req.parent.guardianId, dto, proofs);
  }

  @Post(':id/withdraw')
  withdraw(@Req() req: ParentRequest, @Param('id') id: string) {
    return this.claims.withdraw(req.parent.guardianId, id);
  }
}
