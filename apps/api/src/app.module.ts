import { Module } from '@nestjs/common';
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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
