import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LevelsService } from './levels.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('levels')
export class LevelsController {
  constructor(private readonly levelsService: LevelsService) {}

  @Get()
  findAll(@Query('cycleId') cycleId?: string) {
    return this.levelsService.findAll(cycleId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.levelsService.findOne(id);
  }

  @Post()
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  create(@Body() dto: CreateLevelDto, @CurrentUser() user: CurrentUserData) {
    return this.levelsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLevelDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.levelsService.update(id, dto, user.id);
  }
}
