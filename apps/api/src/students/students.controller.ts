import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { studentPhotoMulterOptions } from './student-photo.storage';
import { StudentsService } from './students.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { AttachGuardianDto } from './dto/attach-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { redactStudentGuardians } from './guardian-redaction.util';

@Controller('students')
@RequirePermission('STUDENT_READ')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly financialStatusService: FinancialStatusService,
  ) {}

  @Get()
  findAll(
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.studentsService.findAll(classId, academicYearId);
  }

  @Get('search')
  async search(@Query('q') q: string, @CurrentUser() user: CurrentUserData) {
    // Sans GUARDIAN_DETAIL_READ (surveillant), les responsables sont réduits au nom, au lien et au téléphone.
    const students = await this.studentsService.search(q ?? '');
    return students.map((s) => redactStudentGuardians(s, user));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return redactStudentGuardians(await this.studentsService.findOne(id), user);
  }

  // Photo d'élève : jamais servie par le dossier public /uploads, uniquement ici, pour le personnel connecté.
  @Get(':id/photo')
  async getPhoto(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.studentsService.getPhotoFile(id);
    res.set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }

  @Post(':id/photo')
  @RequirePermission('ENROLLMENT_MANAGE')
  @UseInterceptors(FileInterceptor('file', studentPhotoMulterOptions))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    return this.studentsService.updatePhoto(id, file.filename, user.id);
  }

  @Get(':id/financial-status')
  @RequirePermission('FINANCE_READ')
  getFinancialStatus(@Param('id') id: string) {
    return this.financialStatusService.getForStudent(id);
  }

  @Post()
  @RequirePermission('ENROLLMENT_MANAGE')
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: CurrentUserData) {
    return this.studentsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ENROLLMENT_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.studentsService.update(id, dto, user.id);
  }

  @Post(':id/guardians')
  @RequirePermission('ENROLLMENT_MANAGE')
  attachGuardian(
    @Param('id') id: string,
    @Body() dto: AttachGuardianDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.studentsService.attachGuardian(id, dto, user.id);
  }

  @Patch('guardians/:guardianId')
  @RequirePermission('ENROLLMENT_MANAGE')
  updateGuardian(
    @Param('guardianId') guardianId: string,
    @Body() dto: UpdateGuardianDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.studentsService.updateGuardian(guardianId, dto, user.id);
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermission('ENROLLMENT_MANAGE')
  detachGuardian(
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.studentsService.detachGuardian(id, guardianId, user.id);
  }
}
