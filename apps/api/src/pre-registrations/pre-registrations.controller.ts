import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PreRegistrationsService } from './pre-registrations.service';
import {
  AcceptPreRegistrationDto,
  CreatePreRegistrationDto,
  ListPreRegistrationsQueryDto,
  RejectPreRegistrationDto,
  TrackPreRegistrationQueryDto,
} from './dto/pre-registration.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Public : niveaux, dépôt d'une demande, suivi par référence + téléphone. Personnel (ENROLLMENT_MANAGE, le même
// droit que l'inscription manuelle, aucun droit nouveau) : liste, détail, accepter, refuser.
@Controller('preinscriptions')
export class PreRegistrationsController {
  constructor(private readonly preRegistrations: PreRegistrationsService) {}

  @Public()
  @Get('niveaux')
  niveaux() {
    return this.preRegistrations.publicLevelTree();
  }

  @Public()
  @Post()
  create(@Body() dto: CreatePreRegistrationDto) {
    return this.preRegistrations.create(dto);
  }

  @Public()
  @Get('suivi')
  track(@Query() query: TrackPreRegistrationQueryDto) {
    return this.preRegistrations.track(query.reference, query.telephone);
  }

  @Get()
  @RequirePermission('ENROLLMENT_MANAGE')
  list(@Query() query: ListPreRegistrationsQueryDto) {
    return this.preRegistrations.list(query.statut);
  }

  @Get(':id')
  @RequirePermission('ENROLLMENT_MANAGE')
  findOne(@Param('id') id: string) {
    return this.preRegistrations.findOne(id);
  }

  @Post(':id/accepter')
  @RequirePermission('ENROLLMENT_MANAGE')
  accept(@Param('id') id: string, @Body() dto: AcceptPreRegistrationDto, @CurrentUser() user: CurrentUserData) {
    return this.preRegistrations.accept(id, dto, user.id);
  }

  @Post(':id/rejeter')
  @RequirePermission('ENROLLMENT_MANAGE')
  reject(@Param('id') id: string, @Body() dto: RejectPreRegistrationDto, @CurrentUser() user: CurrentUserData) {
    return this.preRegistrations.reject(id, dto.motif, user.id);
  }
}
