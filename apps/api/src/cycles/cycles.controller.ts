import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CyclesService } from './cycles.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('cycles')
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Get()
  findAll(@Query('sectionId') sectionId?: string) {
    return this.cyclesService.findAll(sectionId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cyclesService.findOne(id);
  }

  @Post()
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  create(@Body() dto: CreateCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.cyclesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ACADEMIC_STRUCTURE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCycleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.cyclesService.update(id, dto, user.id);
  }
}
