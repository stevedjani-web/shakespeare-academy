import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';
import { TimetableModule } from '../timetable/timetable.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { StudentsModule } from '../students/students.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingModule } from '../messaging/messaging.module';
import { GradesModule } from '../grades/grades.module';
import { TextbookModule } from '../textbook/textbook.module';
import { OnlinePaymentsModule } from '../online-payments/online-payments.module';
import { ParentAuthService } from './parent-auth.service';
import { ParentAuthGuard } from './parent-auth.guard';
import { ParentPortalService } from './parent-portal.service';
import { ParentAccountsService } from './parent-accounts.service';
import { ParentAuthController, ParentPortalController } from './parent-portal.controller';
import { ParentAccountsController } from './parent-accounts.controller';
import { ParentNotificationsController } from './parent-notifications.controller';
import { ParentMessagingController } from './parent-messaging.controller';

/** Lot 11 : comptes parents et portail en lecture (addendum v1.1). */
@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    SchoolModule,
    TimetableModule,
    AttendanceModule,
    StudentsModule,
    PaymentsModule,
    NotificationsModule,
    MessagingModule,
    GradesModule,
    TextbookModule,
    OnlinePaymentsModule,
  ],
  controllers: [ParentAuthController, ParentPortalController, ParentNotificationsController, ParentMessagingController, ParentAccountsController],
  providers: [ParentAuthService, ParentAuthGuard, ParentPortalService, ParentAccountsService],
})
export class ParentPortalModule {}
