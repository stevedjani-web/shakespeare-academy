import {
  BadRequestException,
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
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { CancelExpenseDto } from './dto/cancel-expense.dto';
import { DisburseExpenseDto } from './dto/disburse-expense.dto';
import { MAX_EXPENSE_FILE_BYTES, MAX_JUSTIFICATIFS } from './expense-files';
import { pick } from '../common/language';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/**
 * Un envoi avec pièces arrive en multipart : le champ `payload` porte le JSON, les pièces sont des fichiers joints. Le
 * corps multipart n'est pas un DTO : on le valide ici, avec les mêmes règles que n'importe quel corps JSON.
 */
async function parsePayload<T extends object>(
  type: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  let raw: unknown = body;
  if (typeof body?.payload === 'string') {
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException(
        pick({
          fr: 'La demande est illisible.',
          en: 'The request cannot be read.',
        }),
      );
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      pick({ fr: 'La demande est vide.', en: 'The request is empty.' }),
    );
  }
  const dto = plainToInstance(type, raw);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((e) => Object.values(e.constraints ?? {})),
    );
  }
  return dto;
}

function onlyFields(
  files: Express.Multer.File[] | undefined,
  prefix: string,
): Express.Multer.File[] {
  const list = files ?? [];
  for (const file of list) {
    if (!file.fieldname.startsWith(prefix)) {
      throw new BadRequestException(
        pick({
          fr: 'Fichier joint inattendu.',
          en: 'Unexpected attached file.',
        }),
      );
    }
  }
  return list;
}

// Cycle d'une sortie : demande avec justificatif (EXPENSE_CREATE), approbation par le Promoteur ou la Direction
// (EXPENSE_APPROVE), confirmation de la sortie réelle (EXPENSE_DISBURSE). La lecture suit la clôture (CASH_CLOSE).
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

  @Get(':id/attachments/:attachmentId')
  async attachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.expensesService.attachmentFile(id, attachmentId);
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
  @RequirePermission('EXPENSE_CREATE')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        files: MAX_JUSTIFICATIFS,
        fileSize: MAX_EXPENSE_FILE_BYTES,
        fields: 10,
        parts: MAX_JUSTIFICATIFS + 10,
      },
    }),
  )
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dto = await parsePayload(CreateExpenseDto, body);
    const justificatifs = onlyFields(files, 'justificatif').map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
    }));
    return this.expensesService.create(dto, justificatifs, user.id);
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

  @Post(':id/disburse')
  @RequirePermission('EXPENSE_DISBURSE')
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
  async disburse(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dto = await parsePayload(DisburseExpenseDto, body);
    const [proof] = onlyFields(files, 'preuve');
    return this.expensesService.disburse(
      id,
      dto,
      proof && { buffer: proof.buffer, originalname: proof.originalname },
      user.id,
    );
  }

  @Post(':id/cancel')
  @RequireAnyPermission('EXPENSE_CREATE', 'EXPENSE_APPROVE')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.expensesService.cancel(id, dto, user);
  }
}
