import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  ACTIVITY_MAX_DAYS,
  LOGIN_HISTORY_MAX,
  ParentActivityService,
} from './parent-activity.service';

export class ParentActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTIVITY_MAX_DAYS)
  jours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOGIN_HISTORY_MAX)
  limite?: number;
}

// Activité des parents dans leur espace (qui s'est connecté, quand) : même droit que la gestion des comptes parents.
@Controller('parent-activity')
export class ParentActivityController {
  constructor(private readonly activity: ParentActivityService) {}

  // Résumé et une ligne par compte (dernière connexion, nombre de connexions sur la période, enfants).
  @Get()
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  overview(@Query() query: ParentActivityQueryDto) {
    return this.activity.overview(query.jours);
  }

  // Historique des connexions, les plus récentes d'abord.
  @Get('logins')
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  logins(@Query() query: ParentActivityQueryDto) {
    return this.activity.logins(query.jours, query.limite);
  }
}
