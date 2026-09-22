import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DisciplineNature } from '@prisma/client';
import { DisciplineService } from './discipline.service';
import {
  ConvocationIssueDto,
  CreateConvocationDto,
  CreateDisciplineTypeDto,
  CreateRecordDto,
  CreateSanctionTypeDto,
  DecideSanctionDto,
  ListConvocationsQueryDto,
  ListRecordsQueryDto,
  ListSanctionsQueryDto,
  MotifDto,
  UpdateCatalogueDto,
  UpdateRecordDto,
} from './dto/discipline.dto';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Signaler : DISCIPLINE_REPORT (un enseignant : ses classes seulement). Tout lire : DISCIPLINE_READ. Convoquer :
// DISCIPLINE_CONVOKE. Décider, publier, annuler une sanction, corriger un signalement : DISCIPLINE_DECIDE (Direction).
// Les catalogues se gèrent avec PEDAGOGY_MANAGE.
const READERS = ['DISCIPLINE_READ', 'DISCIPLINE_DECIDE'] as const;
const ANY_DISCIPLINE = [
  'DISCIPLINE_REPORT',
  'DISCIPLINE_READ',
  'DISCIPLINE_CONVOKE',
  'DISCIPLINE_DECIDE',
] as const;

@Controller('discipline')
export class DisciplineController {
  constructor(private readonly discipline: DisciplineService) {}

  // ---- signalements

  @Post('records')
  @RequirePermission('DISCIPLINE_REPORT')
  createRecord(
    @Body() dto: CreateRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.createRecord(dto, user);
  }

  // La portée (un enseignant ne voit que les siens) est appliquée par le service.
  @Get('records')
  @RequireAnyPermission('DISCIPLINE_REPORT', ...READERS)
  listRecords(
    @Query() query: ListRecordsQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.listRecords(query, user);
  }

  @Patch('records/:id')
  @RequireAnyPermission('DISCIPLINE_REPORT', 'DISCIPLINE_DECIDE')
  updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.updateRecord(id, dto, user);
  }

  @Post('records/:id/annuler')
  @RequirePermission('DISCIPLINE_DECIDE')
  cancelRecord(
    @Param('id') id: string,
    @Body() dto: MotifDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.cancelRecord(id, dto.motif, user);
  }

  @Post('records/:id/classer')
  @RequirePermission('DISCIPLINE_DECIDE')
  closeRecord(
    @Param('id') id: string,
    @Body() dto: MotifDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.closeWithoutAction(id, dto.motif, user);
  }

  // ---- sanctions

  @Post('records/:id/sanctions')
  @RequirePermission('DISCIPLINE_DECIDE')
  decideSanction(
    @Param('id') id: string,
    @Body() dto: DecideSanctionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.decideSanction(id, dto, user);
  }

  @Get('sanctions')
  @RequirePermission('DISCIPLINE_DECIDE')
  listSanctions(@Query() query: ListSanctionsQueryDto) {
    return this.discipline.listSanctions(query);
  }

  @Post('sanctions/:id/publier')
  @RequirePermission('DISCIPLINE_DECIDE')
  publishSanction(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.publishSanction(id, user);
  }

  @Post('sanctions/:id/annuler')
  @RequirePermission('DISCIPLINE_DECIDE')
  cancelSanction(
    @Param('id') id: string,
    @Body() dto: MotifDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.cancelSanction(id, dto.motif, user);
  }

  // ---- convocations

  @Post('convocations')
  @RequirePermission('DISCIPLINE_CONVOKE')
  createConvocation(
    @Body() dto: CreateConvocationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.createConvocation(dto, user);
  }

  @Get('convocations')
  @RequireAnyPermission('DISCIPLINE_CONVOKE', ...READERS)
  listConvocations(@Query() query: ListConvocationsQueryDto) {
    return this.discipline.listConvocations(query);
  }

  @Post('convocations/:id/annuler')
  @RequirePermission('DISCIPLINE_CONVOKE')
  cancelConvocation(
    @Param('id') id: string,
    @Body() dto: MotifDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.cancelConvocation(id, dto.motif, user);
  }

  @Post('convocations/:id/issue')
  @RequirePermission('DISCIPLINE_CONVOKE')
  setIssue(
    @Param('id') id: string,
    @Body() dto: ConvocationIssueDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.setConvocationIssue(id, dto.issue, user);
  }

  // ---- dossier d'un élève et sélecteurs (l'enseignant n'a pas STUDENT_READ)

  @Get('students/:id/history')
  @RequireAnyPermission(...READERS)
  studentHistory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.studentHistory(id, user);
  }

  @Get('my-classes')
  @RequireAnyPermission('DISCIPLINE_REPORT', ...READERS)
  myClasses(@CurrentUser() user: CurrentUserData) {
    return this.discipline.myClasses(user);
  }

  @Get('classes/:id/students')
  @RequireAnyPermission('DISCIPLINE_REPORT', ...READERS)
  classStudents(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.discipline.classStudents(id, user);
  }

  // ---- catalogues

  @Get('types')
  @RequireAnyPermission(...ANY_DISCIPLINE, 'PEDAGOGY_MANAGE')
  listTypes(@Query('nature') nature?: DisciplineNature) {
    return this.discipline.listTypes(nature);
  }

  @Post('types')
  @RequirePermission('PEDAGOGY_MANAGE')
  createType(
    @Body() dto: CreateDisciplineTypeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.createType(dto, user);
  }

  @Patch('types/:id')
  @RequirePermission('PEDAGOGY_MANAGE')
  updateType(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogueDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.updateType(id, dto, user);
  }

  @Get('sanction-types')
  @RequireAnyPermission(...ANY_DISCIPLINE, 'PEDAGOGY_MANAGE')
  listSanctionTypes() {
    return this.discipline.listSanctionTypes();
  }

  @Post('sanction-types')
  @RequirePermission('PEDAGOGY_MANAGE')
  createSanctionType(
    @Body() dto: CreateSanctionTypeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.createSanctionType(dto, user);
  }

  @Patch('sanction-types/:id')
  @RequirePermission('PEDAGOGY_MANAGE')
  updateSanctionType(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogueDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discipline.updateSanctionType(id, dto, user);
  }
}
