import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Get()
  findAll() {
    return this.academicYearsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.academicYearsService.findOne(id);
  }

  @Post()
  @RequirePermission('ACADEMIC_YEAR_MANAGE')
  create(
    @Body() dto: CreateAcademicYearDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.academicYearsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ACADEMIC_YEAR_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.academicYearsService.update(id, dto, user.id);
  }

  @Post(':id/activate')
  @RequirePermission('ACADEMIC_YEAR_MANAGE')
  activate(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.academicYearsService.activate(id, user.id);
  }

  @Post(':id/close')
  @RequirePermission('ACADEMIC_YEAR_MANAGE')
  close(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.academicYearsService.close(id, user.id);
  }
}
