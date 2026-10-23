import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TimeGridsService } from './time-grids.service';
import { ClassCombinationsService } from './class-combinations.service';
import {
  CreateClassCombinationDto,
  CreateTimeGridDto,
  SetGridLevelsDto,
  UpdateClassCombinationDto,
  UpdateTimeGridDto,
} from './dto/pedagogy.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Lecture ouverte à tout utilisateur connecté (données non personnelles) ; toute écriture exige PEDAGOGY_MANAGE.

@Controller('time-grids')
export class TimeGridsController {
  constructor(private readonly grids: TimeGridsService) {}

  @Get()
  list() {
    return this.grids.list();
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateTimeGridDto, @CurrentUser() user: CurrentUserData) {
    return this.grids.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeGridDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grids.update(id, dto, user.id);
  }

  @Put(':id/levels')
  @RequirePermission('PEDAGOGY_MANAGE')
  setLevels(
    @Param('id') id: string,
    @Body() dto: SetGridLevelsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grids.setLevels(id, dto.levelIds, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.grids.remove(id, user.id);
  }
}

@Controller('class-combinations')
export class ClassCombinationsController {
  constructor(private readonly combinations: ClassCombinationsService) {}

  @Get()
  list(@Query('academicYearId') academicYearId?: string) {
    return this.combinations.list(academicYearId);
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(
    @Body() dto: CreateClassCombinationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.combinations.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClassCombinationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.combinations.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.combinations.remove(id, user.id);
  }
}
