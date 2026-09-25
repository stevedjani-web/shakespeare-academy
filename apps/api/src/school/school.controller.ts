import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SchoolService } from './school.service';
import { UpdateSchoolDto } from './dto/update-school.dto';
import {
  schoolLogoMulterOptions,
  schoolSignatureMulterOptions,
} from './school-logo.storage';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  // Public : nom, adresse, téléphone et logo seulement (préinscription, marque de l'application).
  @Public()
  @Get('public')
  publicProfile() {
    return this.schoolService.getPublicProfile();
  }

  @Get()
  findDefault() {
    return this.schoolService.getDefault();
  }

  @Patch()
  @RequirePermission('SETTINGS_MANAGE')
  update(@Body() dto: UpdateSchoolDto, @CurrentUser() user: CurrentUserData) {
    return this.schoolService.update(dto, user.id);
  }

  @Post('logo')
  @RequirePermission('SETTINGS_MANAGE')
  @UseInterceptors(FileInterceptor('file', schoolLogoMulterOptions))
  uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    return this.schoolService.updateLogo(
      `/uploads/school/${file.filename}`,
      user.id,
    );
  }

  // Image de la signature figurant sur les attestations (Lot 19). Comme le logo, elle est publique : aucune donnée
  // personnelle, et le PDF de l'attestation la charge depuis le navigateur.
  @Post('signature')
  @RequirePermission('SETTINGS_MANAGE')
  @UseInterceptors(FileInterceptor('file', schoolSignatureMulterOptions))
  uploadSignature(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    return this.schoolService.updateSignature(
      `/uploads/school/${file.filename}`,
      user.id,
    );
  }
}
