import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';

/**
 * Lot 13 : messagerie sécurisée et annonces (addendum v1.1). Les routes du portail parent qui s'appuient sur
 * ce service sont dans le module du portail (elles utilisent la garde des parents).
 */
@Module({
  imports: [AuditModule, SchoolModule, NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
