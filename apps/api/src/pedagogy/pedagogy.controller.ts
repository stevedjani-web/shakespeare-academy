import { Body, Controller, Get, Patch, Put, Query } from '@nestjs/common';
import { PedagogyService } from './pedagogy.service';
import { SetPilotDto, UpdatePedagogySettingsDto } from './dto/pedagogy.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('pedagogy')
export class PedagogyController {
  constructor(private readonly pedagogy: PedagogyService) {}

  @Get('settings')
  getSettings() {
    return this.pedagogy.getSettings();
  }

  @Patch('settings')
  @RequirePermission('PEDAGOGY_MANAGE')
  updateSettings(
    @Body() dto: UpdatePedagogySettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pedagogy.updateSettings(dto, user.id);
  }

  @Get('summary')
  @RequirePermission('PEDAGOGY_MANAGE')
  summary(@Query('academicYearId') academicYearId?: string) {
    return this.pedagogy.summary(academicYearId);
  }

  @Get('pilot')
  @RequirePermission('PEDAGOGY_MANAGE')
  getPilot() {
    return this.pedagogy.getPilot();
  }

  @Put('pilot')
  @RequirePermission('PEDAGOGY_MANAGE')
  setPilot(@Body() dto: SetPilotDto, @CurrentUser() user: CurrentUserData) {
    return this.pedagogy.setPilot(dto, user.id);
  }
}
