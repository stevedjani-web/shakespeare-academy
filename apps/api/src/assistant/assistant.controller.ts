import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { AssistantService } from './assistant.service';
import {
  SuggestReplyDto,
  UpdateAssistantSettingsDto,
} from './dto/assistant.dto';

/**
 * Lot 22 : assistant de rédaction de la messagerie (mode brouillon). Réservé à ceux qui peuvent déjà répondre
 * (`MESSAGE_USE`) ; les réglages, le coût et la FAQ sont à la Direction et à l'Administrateur (`PEDAGOGY_MANAGE`).
 */
@Controller('messaging/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  @RequirePermission('MESSAGE_USE')
  status(@CurrentUser() user: CurrentUserData) {
    return this.assistant.status(user);
  }

  @Get('settings')
  @RequirePermission('PEDAGOGY_MANAGE')
  settings() {
    return this.assistant.getSettings();
  }

  @Patch('settings')
  @RequirePermission('PEDAGOGY_MANAGE')
  updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateAssistantSettingsDto,
  ) {
    return this.assistant.updateSettings(dto, user.id);
  }

  @Post('threads/:id/suggest-reply')
  @RequirePermission('MESSAGE_USE')
  suggest(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: SuggestReplyDto,
  ) {
    return this.assistant.suggest(user, id, dto.consigne);
  }
}
