import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { BankPaymentsService } from './bank-payments.service';
import { SchoolBankAccountsService } from './school-bank-accounts.service';
import {
  ConfirmBankPaymentDto,
  RejectBankPaymentDto,
  ResolveSurplusDto,
  SchoolBankAccountDto,
  StaffDeclareBankPaymentDto,
  UpdateSchoolBankAccountDto,
  ValidateBankPaymentDto,
} from './dto/bank-payments.dto';
import { MAX_EXPENSE_FILE_BYTES } from '../expenses/expense-files';
import { MAX_BANK_PROOFS } from './bank-payment-files';
import { onlyFields, parsePayload } from '../common/multipart-payload';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/**
 * Paiement par banque : une déclaration avec preuve (parent ou secrétariat), le crédit confirmé par le Promoteur sur le
 * relevé de la banque, puis la validation par le secrétariat qui crée le paiement et son reçu. Aucune permission au niveau
 * de la classe : chaque route porte la sienne (la garde exige TOUTES celles qu'elle voit).
 */
@Controller('bank-payments')
export class BankPaymentsController {
  constructor(private readonly claims: BankPaymentsService) {}

  @Get()
  @RequirePermission('FINANCE_READ')
  findAll(@Query('statut') statut?: string) {
    return this.claims.findAll(statut);
  }

  // Avant `:id`, pour ne jamais être pris pour un identifiant.
  @Get('summary')
  @RequirePermission('FINANCE_READ')
  summary() {
    return this.claims.summary();
  }

  @Get('accounts')
  @RequirePermission('FINANCE_READ')
  accounts() {
    return this.claims.staffAccounts();
  }

  @Get('student-context/:studentId')
  @RequirePermission('PAYMENT_CREATE')
  studentContext(@Param('studentId') studentId: string) {
    return this.claims.staffStudentContext(studentId);
  }

  @Get(':id')
  @RequirePermission('FINANCE_READ')
  findOne(@Param('id') id: string) {
    return this.claims.findOne(id);
  }

  @Get(':id/proofs/:proofId')
  @RequirePermission('FINANCE_READ')
  async proof(
    @Param('id') id: string,
    @Param('proofId') proofId: string,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.claims.proofFile(id, proofId, user.id);
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
  @RequirePermission('PAYMENT_CREATE')
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
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dto = await parsePayload(StaffDeclareBankPaymentDto, body);
    const proofs = onlyFields(files, 'preuve').map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
    }));
    return this.claims.declareForStaff(user.id, dto, proofs);
  }

  @Post(':id/confirm')
  @RequirePermission('BANK_PAYMENT_CONFIRM')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmBankPaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.claims.confirm(id, dto, user.id);
  }

  @Post(':id/validate')
  @RequirePermission('PAYMENT_CREATE')
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateBankPaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.claims.validate(id, dto, user.id);
  }

  @Post(':id/reject')
  @RequireAnyPermission('PAYMENT_CREATE', 'BANK_PAYMENT_CONFIRM')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBankPaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.claims.reject(id, dto, user.id);
  }

  @Post(':id/resolve-surplus')
  @RequirePermission('BANK_PAYMENT_CONFIRM')
  resolveSurplus(
    @Param('id') id: string,
    @Body() dto: ResolveSurplusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.claims.resolveSurplus(id, dto, user.id);
  }
}

/** Comptes bancaires de l'école : lus par les profils financiers, saisis par l'Administrateur (réglages). */
@Controller('school-bank-accounts')
export class SchoolBankAccountsController {
  constructor(private readonly accounts: SchoolBankAccountsService) {}

  @Get()
  @RequireAnyPermission('SETTINGS_READ', 'FINANCE_READ')
  findAll() {
    return this.accounts.findAll();
  }

  @Post()
  @RequirePermission('SETTINGS_MANAGE')
  create(
    @Body() dto: SchoolBankAccountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.accounts.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('SETTINGS_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolBankAccountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.accounts.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('SETTINGS_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.accounts.remove(id, user.id);
  }
}
