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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
