import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MessagingService } from '../messaging/messaging.service';
import {
  MessageTextDto,
  ParentNewThreadDto,
  ReportMessageDto,
} from '../messaging/dto/messaging.dto';
import { ParentAuthGuard, type ParentIdentity } from './parent-auth.guard';

type ParentRequest = Request & { parent: ParentIdentity };

/**
 * Messagerie et annonces vues par le responsable (Lot 13) : uniquement avec un jeton de parent. Il n'écrit
 * qu'aux enseignants de la classe de SON enfant ou à l'école (RV09), jamais à un autre parent.
 */
@Public()
@UseGuards(ParentAuthGuard)
@Controller('portal')
export class ParentMessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('messages/contacts')
  contacts(@Req() req: ParentRequest, @Query('studentId') studentId: string) {
    return this.messaging.parentContacts(
      req.parent.guardianId,
      studentId ?? '',
    );
  }

  @Get('messages/threads')
  threads(@Req() req: ParentRequest) {
    return this.messaging.parentThreads(req.parent.guardianId);
  }

  @Get('messages/unread-count')
  unread(@Req() req: ParentRequest) {
    return this.messaging.parentUnreadCount(req.parent.guardianId);
  }

  @Get('messages/unread-preview')
  unreadPreview(@Req() req: ParentRequest) {
    return this.messaging.parentUnreadPreview(req.parent.guardianId);
  }

  @Post('messages/threads')
  createThread(@Req() req: ParentRequest, @Body() dto: ParentNewThreadDto) {
    return this.messaging.parentCreateThread(req.parent.guardianId, dto);
  }

  @Get('messages/threads/:id')
  thread(@Req() req: ParentRequest, @Param('id') id: string) {
    return this.messaging.parentThread(req.parent.guardianId, id);
  }

  @Post('messages/threads/:id/messages')
  send(
    @Req() req: ParentRequest,
    @Param('id') id: string,
    @Body() dto: MessageTextDto,
  ) {
    return this.messaging.parentSend(req.parent.guardianId, id, dto.texte);
  }

  @Post('messages/messages/:id/report')
  report(
    @Req() req: ParentRequest,
    @Param('id') id: string,
    @Body() dto: ReportMessageDto,
  ) {
    return this.messaging.parentReport(req.parent.guardianId, id, dto.motif);
  }

  @Get('announcements')
  announcements(@Req() req: ParentRequest) {
    return this.messaging.parentAnnouncements(req.parent.guardianId);
  }
}
