import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER } from './push-sender.interface';
import { WebPushSender } from './web-push.sender';

/**
 * Lot 12 : notifications aux parents (addendum v1.1). Ce module ne dépend d'aucun autre module métier :
 * ce sont l'assiduité et l'emploi du temps qui l'appellent, jamais l'inverse.
 */
@Module({
  providers: [
    NotificationsService,
    { provide: PUSH_SENDER, useClass: WebPushSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
