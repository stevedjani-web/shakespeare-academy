import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { SchoolModule } from './school/school.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { SectionsModule } from './sections/sections.module';
import { CyclesModule } from './cycles/cycles.module';
import { LevelsModule } from './levels/levels.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { FeeTypesModule } from './fee-types/fee-types.module';
import { FeeSchedulesModule } from './fee-schedules/fee-schedules.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DiscountsModule } from './discounts/discounts.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { PedagogyModule } from './pedagogy/pedagogy.module';
import { TimetableModule } from './timetable/timetable.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TeacherCheckinsModule } from './teacher-checkins/teacher-checkins.module';
import { ParentPortalModule } from './parent-portal/parent-portal.module';
import { MessagingModule } from './messaging/messaging.module';
import { PilotageModule } from './pilotage/pilotage.module';
import { GradesModule } from './grades/grades.module';
import { TextbookModule } from './textbook/textbook.module';
import { OnlinePaymentsModule } from './online-payments/online-payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    SchoolModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AcademicYearsModule,
    SectionsModule,
    CyclesModule,
    LevelsModule,
    ClassesModule,
    StudentsModule,
    EnrollmentsModule,
    FeeTypesModule,
    FeeSchedulesModule,
    InvoicesModule,
    DiscountsModule,
    PaymentsModule,
    ExpensesModule,
    ReportsModule,
    PedagogyModule,
    TimetableModule,
    AttendanceModule,
    TeacherCheckinsModule,
    ParentPortalModule,
    MessagingModule,
    PilotageModule,
    GradesModule,
    TextbookModule,
    OnlinePaymentsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
