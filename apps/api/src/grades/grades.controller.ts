import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { GradesService } from './grades.service';
import { BulletinsService } from './bulletins.service';
import { GradeSettingsService } from './grade-settings.service';
import {
  CreateEvaluationDto,
  PeriodRefDto,
  ReopenPeriodDto,
  SaveAppreciationsDto,
  SaveNotesDto,
  SetBulletinAppreciationDto,
  UpdateEvaluationDto,
  UpdateGradeSettingsDto,
} from './dto/grades.dto';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

function required(value: string | undefined, name: string): string {
  if (!value) throw new BadRequestException(`${name} est obligatoire.`);
  return value;
}

// Saisie : GRADE_ENTER (un enseignant, limité à ses affectations par le service). Lecture de toute l'école : GRADE_READ.
// Correction d'un trimestre verrouillé : GRADE_CORRECT. Validation, rouverture, publication : BULLETIN_VALIDATE.
@Controller('grades')
export class GradesController {
  constructor(
    private readonly grades: GradesService,
    private readonly bulletins: BulletinsService,
    private readonly settings: GradeSettingsService,
  ) {}

  @Get('context')
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_READ')
  context(@CurrentUser() user: CurrentUserData) {
    return this.grades.context(user);
  }

  // ------------------------------------------------------------------ Évaluations et notes

  @Get('evaluations')
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_READ')
  evaluations(
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.grades.listEvaluations(user, { classId, subjectId, termId });
  }

  @Post('evaluations')
  @RequirePermission('GRADE_ENTER')
  createEvaluation(
    @Body() dto: CreateEvaluationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grades.createEvaluation(dto, user);
  }

  @Patch('evaluations/:id')
  @RequirePermission('GRADE_ENTER')
  updateEvaluation(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grades.updateEvaluation(id, dto, user);
  }

  @Delete('evaluations/:id')
  @RequirePermission('GRADE_ENTER')
  deleteEvaluation(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grades.deleteEvaluation(id, user);
  }

  @Get('evaluations/:id/sheet')
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_READ')
  sheet(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.grades.sheet(id, user);
  }

  // POST (et non PUT) : l'enregistrement d'une feuille est une commande idempotente rejouable par la file hors ligne.
  @Post('evaluations/:id/notes')
  @HttpCode(200)
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_CORRECT')
  saveNotes(
    @Param('id') id: string,
    @Body() dto: SaveNotesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grades.saveNotes(id, dto, user);
  }

  // ------------------------------------------------------------------ Résultats et appréciations

  @Get('results')
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_READ')
  results(
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.grades.classResults(
      user,
      required(classId, 'classId'),
      required(termId, 'termId'),
    );
  }

  @Get('appreciations')
  @RequireAnyPermission('GRADE_ENTER', 'GRADE_READ')
  appreciations(
    @CurrentUser() user: CurrentUserData,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.grades.listAppreciations(user, {
      termId: required(termId, 'termId'),
      classId: required(classId, 'classId'),
      subjectId: required(subjectId, 'subjectId'),
    });
  }

  @Put('appreciations')
  @RequirePermission('GRADE_ENTER')
  saveAppreciations(
    @Body() dto: SaveAppreciationsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.grades.saveAppreciations(dto, user);
  }

  // ------------------------------------------------------------------ Trimestre d'une classe et bulletins

  @Get('period')
  @RequireAnyPermission('GRADE_READ', 'BULLETIN_VALIDATE')
  period(@Query('termId') termId?: string, @Query('classId') classId?: string) {
    return this.bulletins.period(
      required(termId, 'termId'),
      required(classId, 'classId'),
    );
  }

  @Post('period/validate')
  @RequirePermission('BULLETIN_VALIDATE')
  validate(@Body() dto: PeriodRefDto, @CurrentUser() user: CurrentUserData) {
    return this.bulletins.validate(dto.termId, dto.classId, user);
  }

  @Post('period/reopen')
  @RequirePermission('BULLETIN_VALIDATE')
  reopen(@Body() dto: ReopenPeriodDto, @CurrentUser() user: CurrentUserData) {
    return this.bulletins.reopen(dto.termId, dto.classId, dto.motif, user);
  }

  @Post('period/publish')
  @RequirePermission('BULLETIN_VALIDATE')
  publish(@Body() dto: PeriodRefDto, @CurrentUser() user: CurrentUserData) {
    return this.bulletins.publish(dto.termId, dto.classId, user);
  }

  @Get('bulletins')
  @RequireAnyPermission('GRADE_READ', 'BULLETIN_VALIDATE')
  bulletinList(
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.bulletins.list(
      required(termId, 'termId'),
      required(classId, 'classId'),
    );
  }

  @Get('bulletins/:id')
  @RequireAnyPermission('GRADE_READ', 'BULLETIN_VALIDATE')
  bulletin(@Param('id') id: string) {
    return this.bulletins.detail(id);
  }

  @Put('bulletins/:id/appreciation')
  @RequirePermission('BULLETIN_VALIDATE')
  setAppreciation(
    @Param('id') id: string,
    @Body() dto: SetBulletinAppreciationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.bulletins.setAppreciation(id, dto.texte, user);
  }

  // ------------------------------------------------------------------ Paramètres

  @Get('settings')
  @RequirePermission('PEDAGOGY_MANAGE')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermission('PEDAGOGY_MANAGE')
  updateSettings(
    @Body() dto: UpdateGradeSettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.settings.update(dto, user.id);
  }
}
