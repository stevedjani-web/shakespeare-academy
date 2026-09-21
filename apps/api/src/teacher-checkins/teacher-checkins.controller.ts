import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TeacherCheckinsService } from './teacher-checkins.service';
import { PointageCodesService } from './pointage-codes.service';
import { DecideCheckinDto, ManualDayDto, ManualSessionDto, RotateCodeDto, ScanDto } from './dto/checkin.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// Scanner et voir son propre pointage : TEACHER_CHECKIN_SELF. Consulter : TEACHER_CHECKIN_READ.
// Valider, rejeter, corriger : TEACHER_CHECKIN_VALIDATE. QR codes : PEDAGOGY_MANAGE.

@Controller('teacher-checkins')
export class TeacherCheckinsController {
  constructor(private readonly checkins: TeacherCheckinsService) {}

  @Post('scan')
  @RequirePermission('TEACHER_CHECKIN_SELF')
  scan(@Body() dto: ScanDto, @CurrentUser() user: CurrentUserData) {
    return this.checkins.scan(user.id, dto);
  }

  @Get('me')
  @RequirePermission('TEACHER_CHECKIN_SELF')
  mine(@CurrentUser() user: CurrentUserData) {
    return this.checkins.mine(user.id);
  }

  @Get('day')
  @RequirePermission('TEACHER_CHECKIN_READ')
  day(@Query('date') date: string) {
    if (!date || !DATE.test(date)) throw new BadRequestException('date doit être au format AAAA-MM-JJ.');
    return this.checkins.listDay(date);
  }

  @Get('summary')
  @RequirePermission('TEACHER_CHECKIN_READ')
  summary(@Query('month') month: string, @Query('teacherId') teacherId?: string) {
    if (!month || !MONTH.test(month)) throw new BadRequestException('month doit être au format AAAA-MM.');
    return this.checkins.summary(month, teacherId);
  }

  @Post('sessions/manual')
  @RequirePermission('TEACHER_CHECKIN_VALIDATE')
  manualSession(@Body() dto: ManualSessionDto, @CurrentUser() user: CurrentUserData) {
    return this.checkins.manualSession(dto, user.id);
  }

  @Post('days/manual')
  @RequirePermission('TEACHER_CHECKIN_VALIDATE')
  manualDay(@Body() dto: ManualDayDto, @CurrentUser() user: CurrentUserData) {
    return this.checkins.manualDay(dto, user.id);
  }

  @Post('sessions/:id/decision')
  @RequirePermission('TEACHER_CHECKIN_VALIDATE')
  decideSession(@Param('id') id: string, @Body() dto: DecideCheckinDto, @CurrentUser() user: CurrentUserData) {
    return this.checkins.decideSession(id, dto, user.id);
  }

  @Post('days/:id/decision')
  @RequirePermission('TEACHER_CHECKIN_VALIDATE')
  decideDay(@Param('id') id: string, @Body() dto: DecideCheckinDto, @CurrentUser() user: CurrentUserData) {
    return this.checkins.decideDay(id, dto, user.id);
  }
}

@Controller('pointage-codes')
@RequirePermission('PEDAGOGY_MANAGE')
export class PointageCodesController {
  constructor(private readonly codes: PointageCodesService) {}

  @Get()
  list() {
    return this.codes.list();
  }

  @Post('generate')
  generate(@CurrentUser() user: CurrentUserData) {
    return this.codes.generateMissing(user.id);
  }

  @Post('rotate')
  rotate(@Body() dto: RotateCodeDto, @CurrentUser() user: CurrentUserData) {
    return this.codes.rotate(dto.roomId, user.id);
  }
}
