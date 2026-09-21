import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import {
  CreateAssignmentDto,
  CreateTeacherDto,
  SetTeacherSubjectsDto,
  UpdateAssignmentDto,
  UpdateTeacherDto,
} from './dto/pedagogy.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Données personnelles (téléphone, e-mail) : lecture et écriture exigent PEDAGOGY_MANAGE.

@Controller('teachers')
@RequirePermission('PEDAGOGY_MANAGE')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list() {
    return this.teachers.listTeachers();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teachers.findTeacher(id);
  }

  @Post()
  create(@Body() dto: CreateTeacherDto, @CurrentUser() user: CurrentUserData) {
    return this.teachers.createTeacher(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.teachers.updateTeacher(id, dto, user.id);
  }

  @Put(':id/subjects')
  setSubjects(
    @Param('id') id: string,
    @Body() dto: SetTeacherSubjectsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.teachers.setTeacherSubjects(id, dto, user.id);
  }
}

@Controller('assignments')
@RequirePermission('PEDAGOGY_MANAGE')
export class AssignmentsController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  list(
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.teachers.listAssignments({
      classId,
      teacherId,
      academicYearId,
    });
  }

  @Get('by-class/:classId')
  byClass(@Param('classId') classId: string) {
    return this.teachers.assignmentsByClass(classId);
  }

  @Post()
  create(
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.teachers.createAssignment(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.teachers.updateAssignment(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.teachers.deleteAssignment(id, user.id);
  }
}
