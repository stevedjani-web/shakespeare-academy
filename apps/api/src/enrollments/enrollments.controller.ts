import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { CancelEnrollmentDto } from './dto/cancel-enrollment.dto';
import { ChangeClassDto } from './dto/change-class.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('enrollments')
@RequirePermission('STUDENT_READ')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  findAll(
    @Query('studentId') studentId?: string,
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.enrollmentsService.findAll(studentId, classId, academicYearId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Post()
  @RequirePermission('ENROLLMENT_MANAGE')
  create(
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.enrollmentsService.create(dto, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('ENROLLMENT_MANAGE')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEnrollmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.enrollmentsService.cancel(id, dto, user.id);
  }

  @Post(':id/change-class')
  @RequirePermission('ENROLLMENT_MANAGE')
  changeClass(
    @Param('id') id: string,
    @Body() dto: ChangeClassDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.enrollmentsService.changeClass(id, dto, user.id);
  }
}
