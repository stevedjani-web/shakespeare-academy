import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SchoolService } from './school.service';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get()
  findDefault() {
    return this.schoolService.getDefault();
  }

  @Patch()
  @RequirePermission('SETTINGS_MANAGE')
  update(@Body() dto: UpdateSchoolDto, @CurrentUser() user: CurrentUserData) {
    return this.schoolService.update(dto, user.id);
  }
}
