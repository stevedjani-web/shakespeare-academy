import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { BankDepositsService } from './bank-deposits.service';
import { CreateBankDepositDto } from './dto/create-bank-deposit.dto';
import { RejectBankDepositDto } from './dto/reject-bank-deposit.dto';
import { MAX_EXPENSE_FILE_BYTES } from '../expenses/expense-files';
import { onlyFields, parsePayload } from '../common/multipart-payload';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Versement en banque : déclaration avec bordereau (BANK_DEPOSIT_CREATE), vérification par une autre personne
// (BANK_DEPOSIT_VERIFY). La lecture suit la clôture de journée (CASH_CLOSE).
@Controller('bank-deposits')
@RequirePermission('CASH_CLOSE')
export class BankDepositsController {
  constructor(private readonly deposits: BankDepositsService) {}

  @Get()
  findAll(@Query('statut') statut?: string) {
    return this.deposits.findAll(statut);
  }

  // Avant `:id`, pour ne jamais être pris pour un identifiant.
  @Get('summary')
  summary() {
    return this.deposits.summary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deposits.findOne(id);
  }

  @Get(':id/receipt')
  async receipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.deposits.receiptFile(id);
    res.set({
      'Content-Type': file.type,
      // Nom affiché encodé (RFC 5987) : jamais un nom brut dans l'en-tête.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.nom)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }

  @Post()
  @RequirePermission('BANK_DEPOSIT_CREATE')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: MAX_EXPENSE_FILE_BYTES,
        fields: 10,
        parts: 11,
      },
    }),
  )
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dto = await parsePayload(CreateBankDepositDto, body);
    const [receipt] = onlyFields(files, 'bordereau');
    return this.deposits.create(
      dto,
      receipt && { buffer: receipt.buffer, originalname: receipt.originalname },
      user.id,
    );
  }

  @Post(':id/confirm')
  @RequirePermission('BANK_DEPOSIT_VERIFY')
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.deposits.confirm(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('BANK_DEPOSIT_VERIFY')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBankDepositDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deposits.reject(id, dto, user.id);
  }
}
