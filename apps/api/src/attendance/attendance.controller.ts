import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JustificationsService } from './justifications.service';
import {
  CreateJustificationDto,
  CreateReasonDto,
  DecideJustificationDto,
  SaveCallDto,
  UpdateReasonDto,
} from './dto/attendance.dto';
import { RequireAnyPermission, RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: string | undefined, name: string): string {
  if (!value || !DATE.test(value)) {
    throw new BadRequestException(`${name} doit être au format AAAA-MM-JJ.`);
  }
  return value;
}

function optionalDate(value: string | undefined, name: string): string | undefined {
  return value ? requireDate(value, name) : undefined;
}

const JUSTIFICATION_FILTERS = ['aucune', 'attente', 'acceptee', 'refusee'] as const;

// Lecture : ATTENDANCE_READ. Faire l'appel : ATTENDANCE_TAKE. Corriger après verrouillage, saisir et
// décider les justificatifs : ATTENDANCE_CORRECT. Les motifs se gèrent avec PEDAGOGY_MANAGE.

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly justifications: JustificationsService,
  ) {}

  // Un enseignant (ATTENDANCE_TAKE sans ATTENDANCE_READ) ne voit et ne remplit que SES séances : la portée
  // est appliquée par le service (voir AttendanceService.scopeOf), pas seulement masquée à l'écran.
  @Get('day')
  @RequireAnyPermission('ATTENDANCE_READ', 'ATTENDANCE_TAKE')
  async day(
    @Query('date') date: string,
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId?: string,
  ) {
    const scope = await this.attendance.scopeOf(user);
    return this.attendance.day(requireDate(date, 'date'), classId, scope);
  }

  @Get('sheet')
  @RequireAnyPermission('ATTENDANCE_READ', 'ATTENDANCE_TAKE')
  async sheet(
    @Query('entryId') entryId: string,
    @Query('date') date: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!entryId) throw new BadRequestException('entryId est obligatoire.');
    const scope = await this.attendance.scopeOf(user);
    return this.attendance.sheet(entryId, requireDate(date, 'date'), scope);
  }

  @Post('calls')
  @RequirePermission('ATTENDANCE_TAKE')
  async saveCall(@Body() dto: SaveCallDto, @CurrentUser() user: CurrentUserData) {
    return this.attendance.saveCall(dto, {
      id: user.id,
      canCorrect: user.permissions.includes('ATTENDANCE_CORRECT'),
      scope: await this.attendance.scopeOf(user),
    });
  }

  @Get('absences')
  @RequirePermission('ATTENDANCE_READ')
  absences(
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('justification') justification?: string,
  ) {
    if (justification && !(JUSTIFICATION_FILTERS as readonly string[]).includes(justification)) {
      throw new BadRequestException('justification doit valoir aucune, attente, acceptee ou refusee.');
    }
    return this.attendance.listAbsences({
      classId,
      studentId,
      from: optionalDate(from, 'from'),
      to: optionalDate(to, 'to'),
      justification: justification as (typeof JUSTIFICATION_FILTERS)[number] | undefined,
    });
  }

  @Get('students/:studentId/history')
  @RequirePermission('ATTENDANCE_READ')
  history(@Param('studentId') studentId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.attendance.studentHistory(studentId, optionalDate(from, 'from'), optionalDate(to, 'to'));
  }

  @Post('records/:recordId/justification')
  @RequirePermission('ATTENDANCE_CORRECT')
  justify(
    @Param('recordId') recordId: string,
    @Body() dto: CreateJustificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.justifications.create(recordId, dto, user.id);
  }

  @Patch('justifications/:id')
  @RequirePermission('ATTENDANCE_CORRECT')
  decide(
    @Param('id') id: string,
    @Body() dto: DecideJustificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.justifications.decide(id, dto, user.id);
  }
}

@Controller('absence-reasons')
export class AbsenceReasonsController {
  constructor(private readonly justifications: JustificationsService) {}

  // Liste non personnelle, ouverte à tout utilisateur connecté (comme les salles ou les matières).
  @Get()
  list() {
    return this.justifications.listReasons();
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateReasonDto, @CurrentUser() user: CurrentUserData) {
    return this.justifications.createReason(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(@Param('id') id: string, @Body() dto: UpdateReasonDto, @CurrentUser() user: CurrentUserData) {
    return this.justifications.updateReason(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.justifications.deleteReason(id, user.id);
  }
}
