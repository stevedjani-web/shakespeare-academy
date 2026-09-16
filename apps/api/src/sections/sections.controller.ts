import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  findAll() {
    return this.sectionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sectionsService.findOne(id);
  }

  @Post()
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  create(@Body() dto: CreateSectionDto, @CurrentUser() user: CurrentUserData) {
    return this.sectionsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.sectionsService.update(id, dto, user.id);
  }
}
