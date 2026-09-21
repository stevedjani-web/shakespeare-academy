import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import {
  EXPORT_KINDS,
  PilotageService,
  type ExportKind,
} from './pilotage.service';
import { PilotageQueryDto } from './dto/pilotage.dto';

// Tableau de bord de la Direction (Lot 14). PILOTAGE_READ : Direction seulement (données de mineurs, RV12).
@Controller('pilotage')
export class PilotageController {
  constructor(private readonly pilotage: PilotageService) {}

  @Get('dashboard')
  @RequirePermission('PILOTAGE_READ')
  dashboard(@Query() q: PilotageQueryDto) {
    return this.pilotage.dashboard(q.from, q.to, q.classId || undefined);
  }

  @Get('export/:kind')
  @RequirePermission('PILOTAGE_READ')
  async export(
    @Param('kind') kind: string,
    @Query() q: PilotageQueryDto,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!EXPORT_KINDS.includes(kind as ExportKind)) {
      throw new BadRequestException(
        `Export inconnu. Choisissez parmi : ${EXPORT_KINDS.join(', ')}.`,
      );
    }
    const { csv, filename } = await this.pilotage.exportCsv(
      kind as ExportKind,
      user.id,
      q.from,
      q.to,
      q.classId || undefined,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
