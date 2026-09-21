import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParentAccountsService } from './parent-accounts.service';
import { SetLinkAccessDto } from './dto/parent.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Côté école : codes d'activation et désactivation avec PARENT_ACCOUNT_MANAGE ; retirer ou rétablir
// l'accès d'un responsable pour un élève avec PARENT_ACCESS_REVOKE (Direction).

@Controller('parent-accounts')
export class ParentAccountsController {
  constructor(private readonly accounts: ParentAccountsService) {}

  @Get()
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  list(@Query('search') search?: string) {
    return this.accounts.list(search);
  }

  @Post('guardians/:guardianId/activation-code')
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  generateCode(@Param('guardianId') guardianId: string, @CurrentUser() user: CurrentUserData) {
    return this.accounts.generateCode(guardianId, user.id);
  }

  @Post('guardians/:guardianId/deactivate')
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  deactivate(@Param('guardianId') guardianId: string, @CurrentUser() user: CurrentUserData) {
    return this.accounts.setAccountActive(guardianId, false, user.id);
  }

  @Post('guardians/:guardianId/reactivate')
  @RequirePermission('PARENT_ACCOUNT_MANAGE')
  reactivate(@Param('guardianId') guardianId: string, @CurrentUser() user: CurrentUserData) {
    return this.accounts.setAccountActive(guardianId, true, user.id);
  }

  @Patch('links/:linkId/access')
  @RequirePermission('PARENT_ACCESS_REVOKE')
  setLinkAccess(@Param('linkId') linkId: string, @Body() dto: SetLinkAccessDto, @CurrentUser() user: CurrentUserData) {
    return this.accounts.setLinkAccess(linkId, dto, user.id);
  }
}
