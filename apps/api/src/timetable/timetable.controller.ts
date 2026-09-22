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
import { TimetablesService } from './timetables.service';
import { OccurrencesService } from './occurrences.service';
import {
  CreateEntryDto,
  CreateExceptionDto,
  CreateTimetableDto,
  PublishTimetableDto,
  UpdateEntryDto,
} from './dto/timetable.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const canSeeDraft = (user: CurrentUserData) =>
  user.permissions.includes('PEDAGOGY_MANAGE');

function requireDate(value: string | undefined, name: string): string {
  if (!value || !DATE.test(value)) {
    throw new BadRequestException(`${name} doit être au format AAAA-MM-JJ.`);
  }
  return value;
}

// Lecture : TIMETABLE_READ (les brouillons restent réservés à PEDAGOGY_MANAGE). Écriture : PEDAGOGY_MANAGE.

@Controller('timetables')
export class TimetablesController {
  constructor(private readonly timetables: TimetablesService) {}

  @Get()
  @RequirePermission('TIMETABLE_READ')
  list(
    @Query('academicYearId') academicYearId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.timetables.list(academicYearId, canSeeDraft(user));
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(
    @Body() dto: CreateTimetableDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.timetables.create(dto, user.id);
  }

  @Get(':id')
  @RequirePermission('TIMETABLE_READ')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.timetables.findVisible(id, canSeeDraft(user));
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.timetables.remove(id, user.id);
  }

  @Post(':id/publish')
  @RequirePermission('PEDAGOGY_MANAGE')
  publish(
    @Param('id') id: string,
    @Body() dto: PublishTimetableDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.timetables.publish(id, dto, user.id);
  }

  @Post(':id/resync')
  @RequirePermission('PEDAGOGY_MANAGE')
  resync(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.timetables.resync(id, user.id);
  }

  @Get(':id/check')
  @RequirePermission('PEDAGOGY_MANAGE')
  check(@Param('id') id: string) {
    return this.timetables.check(id);
  }

  @Get(':id/entries')
  @RequirePermission('TIMETABLE_READ')
  async entries(
    @Param('id') id: string,
    @Query('classId') classId: string | undefined,
    @Query('teacherId') teacherId: string | undefined,
    @Query('roomId') roomId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.timetables.findVisible(id, canSeeDraft(user));
    return this.timetables.listEntries(id, { classId, teacherId, roomId });
  }

  @Post(':id/entries')
  @RequirePermission('PEDAGOGY_MANAGE')
  createEntry(
    @Param('id') id: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.timetables.createEntry(id, dto, user.id);
  }
}

@Controller('timetable-entries')
export class TimetableEntriesController {
  constructor(
    private readonly timetables: TimetablesService,
    private readonly occurrences: OccurrencesService,
  ) {}

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.timetables.updateEntry(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.timetables.deleteEntry(id, user.id);
  }

  // Changement ponctuel (annulation, remplacement, salle) : ne modifie jamais la version publiée.
  @Post(':id/exceptions')
  @RequirePermission('PEDAGOGY_MANAGE')
  createException(
    @Param('id') id: string,
    @Body() dto: CreateExceptionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.occurrences.createException(id, dto, user.id);
  }
}

@Controller('timetable-exceptions')
export class TimetableExceptionsController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Get()
  @RequirePermission('TIMETABLE_READ')
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.occurrences.listExceptions(
      from ? requireDate(from, 'from') : undefined,
      to ? requireDate(to, 'to') : undefined,
    );
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.occurrences.deleteException(id, user.id);
  }
}

// Emploi du temps réel d'un jour ou d'une semaine (version en vigueur + changements ponctuels).
@Controller('timetable')
export class TimetableViewController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Get('day')
  @RequirePermission('TIMETABLE_READ')
  day(
    @Query('date') date: string,
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.occurrences.resolveDay(requireDate(date, 'date'), {
      classId,
      teacherId,
      roomId,
    });
  }

  @Get('week')
  @RequirePermission('TIMETABLE_READ')
  week(
    @Query('date') date: string,
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.occurrences.week(requireDate(date, 'date'), {
      classId,
      teacherId,
      roomId,
    });
  }
}
