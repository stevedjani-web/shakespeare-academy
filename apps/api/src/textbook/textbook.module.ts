import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TextbookService } from './textbook.service';
import { TextbookController } from './textbook.controller';

/** Lot 16 : cahier de textes et devoirs (vague 2, D51). */
@Module({
  imports: [AuditModule, SchoolModule, NotificationsModule],
  controllers: [TextbookController],
  providers: [TextbookService],
  exports: [TextbookService],
})
export class TextbookModule {}
