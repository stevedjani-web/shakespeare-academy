import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CancelDocumentDto, IssueDocumentDto } from './dto/documents.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('students/:id/documents')
  @RequirePermission('DOCUMENT_ISSUE')
  issue(
    @Param('id') id: string,
    @Body() dto: IssueDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.issue(
      id,
      dto.type,
      { type: 'STAFF', id: user.id },
      { renouveler: dto.renouveler },
    );
  }

  @Get('students/:id/documents')
  @RequirePermission('DOCUMENT_ISSUE')
  list(@Param('id') id: string) {
    return this.documents.listForStudent(id);
  }

  @Post('documents/class-cards/:classId')
  @RequirePermission('DOCUMENT_ISSUE')
  classCards(
    @Param('classId') classId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.issueClassCards(classId, user.id);
  }

  @Post('documents/:id/annuler')
  @RequirePermission('DOCUMENT_CANCEL')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.cancel(id, dto.motif, user.id);
  }

  // Public : ouvert en scannant le QR code d'un document papier, sans compte.
  @Public()
  @Get('documents/verify/:token')
  verify(@Param('token') token: string) {
    return this.documents.verify(token);
  }
}
