import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { MessagingService } from './messaging.service';
import {
  CreateAnnouncementDto,
  MessageTextDto,
  ReportMessageDto,
  StaffNewThreadDto,
  WithdrawDto,
} from './dto/messaging.dto';

// Messagerie et annonces côté personnel. MESSAGE_USE : enseignants, Direction, vie scolaire (chacun ne voit que ses
// conversations, ou celles du guichet de l'école s'il a MESSAGE_DESK). MESSAGE_SUPERVISE : la Direction seule.
// Aucune réponse de ces routes ne contient un numéro de téléphone ni une adresse e-mail (RV09).

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('classes')
  @RequirePermission('MESSAGE_USE')
  classes(@CurrentUser() user: CurrentUserData) {
    return this.messaging.staffClasses(user);
  }

  @Get('recipients')
  @RequirePermission('MESSAGE_USE')
  recipients(
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId: string,
  ) {
    return this.messaging.staffRecipients(user, classId ?? '');
  }

  @Get('threads')
  @RequirePermission('MESSAGE_USE')
  threads(@CurrentUser() user: CurrentUserData) {
    return this.messaging.staffThreads(user);
  }

  @Get('unread-count')
  @RequirePermission('MESSAGE_USE')
  unread(@CurrentUser() user: CurrentUserData) {
    return this.messaging.staffUnreadCount(user);
  }

  @Post('threads')
  @RequirePermission('MESSAGE_USE')
  createThread(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StaffNewThreadDto,
  ) {
    return this.messaging.staffCreateThread(user, dto);
  }

  @Get('threads/:id')
  @RequirePermission('MESSAGE_USE')
  thread(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.messaging.staffThread(user, id);
  }

  @Post('threads/:id/messages')
  @RequirePermission('MESSAGE_USE')
  send(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: MessageTextDto,
  ) {
    return this.messaging.staffSend(user, id, dto.texte, dto.priorite);
  }

  @Post('messages/:id/report')
  @RequirePermission('MESSAGE_USE')
  report(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: ReportMessageDto,
  ) {
    return this.messaging.staffReport(user, id, dto.motif);
  }

  // ------------------------------------------------------------------------------------ Annonces

  @Post('announcements')
  @RequirePermission('MESSAGE_USE')
  createAnnouncement(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.messaging.createAnnouncement(user, dto);
  }

  @Get('announcements')
  @RequirePermission('MESSAGE_USE')
  announcements(
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId?: string,
  ) {
    return this.messaging.staffAnnouncements(user, classId || undefined);
  }

  @Post('announcements/:id/withdraw')
  @RequirePermission('MESSAGE_USE')
  withdrawAnnouncement(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: WithdrawDto,
  ) {
    return this.messaging.withdrawAnnouncement(user, id, dto.motif);
  }

  // ------------------------------------------------------------------------ Supervision (Direction)

  @Get('supervision/threads')
  @RequirePermission('MESSAGE_SUPERVISE')
  supervisionThreads(@Query('search') search?: string) {
    return this.messaging.supervisionThreads(search);
  }

  @Get('supervision/threads/:id')
  @RequirePermission('MESSAGE_SUPERVISE')
  supervisionThread(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.messaging.supervisionThread(user, id);
  }

  @Get('supervision/reports')
  @RequirePermission('MESSAGE_SUPERVISE')
  supervisionReports() {
    return this.messaging.supervisionReports();
  }

  @Post('supervision/reports/:id/resolve')
  @RequirePermission('MESSAGE_SUPERVISE')
  resolveReport(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.messaging.resolveReport(user, id);
  }

  @Post('supervision/messages/:id/withdraw')
  @RequirePermission('MESSAGE_SUPERVISE')
  withdrawMessage(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: WithdrawDto,
  ) {
    return this.messaging.withdrawMessage(user, id, dto.motif);
  }
}
