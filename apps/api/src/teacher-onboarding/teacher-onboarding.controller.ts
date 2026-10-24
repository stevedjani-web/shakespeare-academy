import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { pick } from '../common/language';
import { MAX_TEACHER_PHOTO_BYTES } from './teacher-photo';
import { TeacherOnboardingService } from './teacher-onboarding.service';
import { TeacherSubmissionLimiter } from './teacher-submission-limiter';
import {
  AnalyseTeacherSubmissionQueryDto,
  CreateTeacherLinkDto,
  ListTeacherSubmissionsQueryDto,
  RefuseTeacherSubmissionDto,
  SubmitTeacherDto,
  UpdateTeacherLinkDto,
  ValidateTeacherSubmissionDto,
} from './dto/teacher-onboarding.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/**
 * L'envoi arrive soit en JSON, soit en multipart (champ `payload` = le même JSON, plus une `photo` facultative). Le corps
 * multipart n'est pas un DTO : on le valide ici avec les mêmes règles.
 */
async function parseSubmission(
  body: Record<string, unknown>,
): Promise<SubmitTeacherDto> {
  let raw: unknown = body;
  if (typeof body?.payload === 'string') {
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException(
        pick({
          fr: 'L’envoi est illisible.',
          en: 'The submission cannot be read.',
        }),
      );
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      pick({ fr: 'L’envoi est vide.', en: 'The submission is empty.' }),
    );
  }
  const dto = plainToInstance(SubmitTeacherDto, raw);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((e) => Object.values(e.constraints ?? {})),
    );
  }
  return dto;
}

// Public : la page du lien partagé et l'envoi du formulaire. Personnel (TEACHER_ONBOARDING_MANAGE, le secrétariat) : lien,
// suivi des fiches, file de validation.
@Controller('teacher-onboarding')
export class TeacherOnboardingController {
  constructor(
    private readonly onboarding: TeacherOnboardingService,
    private readonly limiter: TeacherSubmissionLimiter,
  ) {}

  @Public()
  @Get('public/:token')
  info(@Param('token') token: string) {
    return this.onboarding.publicInfo(token);
  }

  @Public()
  @Post('public/:token')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: MAX_TEACHER_PHOTO_BYTES,
        fields: 10,
        parts: 12,
      },
    }),
  )
  async submit(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    // Derrière Caddy, l'adresse est dans X-Forwarded-For (Caddy remplace toute valeur reçue du client).
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      'inconnue';
    this.limiter.assert(ip);
    const dto = await parseSubmission(body);
    return this.onboarding.submit(token, dto, photo?.buffer);
  }

  @Get('link')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  link() {
    return this.onboarding.getLink();
  }

  @Post('link')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  createLink(
    @Body() dto: CreateTeacherLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.onboarding.createLink(
      dto.regenerer === true,
      dto.validiteJours,
      user.id,
    );
  }

  @Patch('link')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  updateLink(
    @Body() dto: UpdateTeacherLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.onboarding.updateLink(dto, user.id);
  }

  @Get('teachers')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  teachers() {
    return this.onboarding.teachersStatus();
  }

  // Photo d'une fiche : fichier privé, lu avec le jeton du personnel habilité.
  @Get('teachers/:teacherId/photo')
  @RequireAnyPermission('TEACHER_ONBOARDING_MANAGE', 'PEDAGOGY_MANAGE')
  async teacherPhoto(
    @Param('teacherId') teacherId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.stream(await this.onboarding.teacherPhoto(teacherId), res);
  }

  @Get('submissions')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  list(@Query() query: ListTeacherSubmissionsQueryDto) {
    return this.onboarding.list(query);
  }

  @Get('submissions/:id/photo')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  async photo(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.stream(await this.onboarding.submissionPhoto(id), res);
  }

  @Get('submissions/:id/analyse')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  analyse(
    @Param('id') id: string,
    @Query() query: AnalyseTeacherSubmissionQueryDto,
  ) {
    return this.onboarding.analyse(id, query.teacherId);
  }

  @Post('submissions/:id/valider')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateTeacherSubmissionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.onboarding.validate(id, dto, user);
  }

  @Post('submissions/:id/refuser')
  @RequirePermission('TEACHER_ONBOARDING_MANAGE')
  refuse(
    @Param('id') id: string,
    @Body() dto: RefuseTeacherSubmissionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.onboarding.refuse(id, dto.motif, user.id);
  }

  private stream(
    file: { path: string; contentType: string },
    res: Response,
  ): StreamableFile {
    res.set({
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }
}
