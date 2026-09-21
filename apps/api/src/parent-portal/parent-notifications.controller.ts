import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentAuthGuard, type ParentIdentity } from './parent-auth.guard';
import {
  ListNotificationsQueryDto,
  SetPreferencesDto,
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/parent-notifications.dto';

type ParentRequest = Request & { parent: ParentIdentity };

/**
 * Notifications vues par le responsable (Lot 12) : uniquement avec un jeton de parent. Chaque route ne
 * touche que les données du compte connecté ; un identifiant d'une autre famille répond « introuvable ».
 */
@Public()
@UseGuards(ParentAuthGuard)
@Controller('portal')
export class ParentNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(@Req() req: ParentRequest, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(
      req.parent.accountId,
      req.parent.guardianId,
      q.limite,
    );
  }

  @Get('notifications/unread-count')
  unreadCount(@Req() req: ParentRequest) {
    return this.notifications.unreadCount(
      req.parent.accountId,
      req.parent.guardianId,
    );
  }

  // Déclarée avant `notifications/:id/read` pour ne jamais être prise pour un identifiant.
  @Post('notifications/read-all')
  readAll(@Req() req: ParentRequest) {
    return this.notifications.markAllRead(req.parent.accountId);
  }

  @Patch('notifications/:id/read')
  read(@Req() req: ParentRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.parent.accountId, id);
  }

  @Get('notification-preferences')
  preferences(@Req() req: ParentRequest) {
    return this.notifications.getPreferences(req.parent.accountId);
  }

  @Put('notification-preferences')
  setPreferences(@Req() req: ParentRequest, @Body() dto: SetPreferencesDto) {
    return this.notifications.setPreferences(
      req.parent.accountId,
      dto.preferences,
    );
  }

  @Get('push/public-key')
  publicKey() {
    return this.notifications.publicKey();
  }

  @Post('push/subscriptions')
  subscribe(@Req() req: ParentRequest, @Body() dto: SubscribePushDto) {
    return this.notifications.subscribe(req.parent.accountId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
  }

  @Post('push/unsubscribe')
  unsubscribe(@Req() req: ParentRequest, @Body() dto: UnsubscribePushDto) {
    return this.notifications.unsubscribe(req.parent.accountId, dto.endpoint);
  }
}
