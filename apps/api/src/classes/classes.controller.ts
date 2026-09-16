import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  findAll(
    @Query('academicYearId') academicYearId?: string,
    @Query('levelId') levelId?: string,
  ) {
    return this.classesService.findAll(academicYearId, levelId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.classesService.findOne(id);
  }

  @Post()
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  create(@Body() dto: CreateClassDto, @CurrentUser() user: CurrentUserData) {
    return this.classesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.classesService.update(id, dto, user.id);
  }
}
