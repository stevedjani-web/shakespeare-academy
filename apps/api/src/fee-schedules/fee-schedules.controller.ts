import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FeeSchedulesService } from './fee-schedules.service';
import { CreateFeeScheduleDto } from './dto/create-fee-schedule.dto';
import { UpdateFeeScheduleDto } from './dto/update-fee-schedule.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('fee-schedules')
export class FeeSchedulesController {
  constructor(private readonly feeSchedulesService: FeeSchedulesService) {}

  @Get()
  findAll(
    @Query('academicYearId') academicYearId?: string,
    @Query('levelId') levelId?: string,
  ) {
    return this.feeSchedulesService.findAll(academicYearId, levelId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feeSchedulesService.findOne(id);
  }

  @Post()
  @RequirePermission('FEE_MANAGE')
  create(@Body() dto: CreateFeeScheduleDto, @CurrentUser() user: CurrentUserData) {
    return this.feeSchedulesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('FEE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeeScheduleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feeSchedulesService.update(id, dto, user.id);
  }
}
