import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { AuditModule } from '../audit/audit.module';
import { SchoolModule } from '../school/school.module';

@Module({
  imports: [AuditModule, SchoolModule],
  controllers: [RolesController, PermissionsController],
  providers: [RolesService],
})
export class RolesModule {}
