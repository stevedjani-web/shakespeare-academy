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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { pick } from '../common/language';
import { MAX_FAMILY_PHOTO_BYTES } from './family-photo';
import { FamilyCollectionService } from './family-collection.service';
import { FamilySubmissionLimiter } from './family-submission-limiter';
import {
  AnalyseFamilyChildQueryDto,
  CreateCollectLinkDto,
  ListFamilySubmissionsQueryDto,
  MAX_FAMILY_CHILDREN,
  RefuseFamilyChildDto,
  SubmitFamilyDto,
  UpdateCollectLinkDto,
  ValidateFamilyChildDto,
} from './dto/family-collection.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/** Messages de validation à plat, avec le nom de la fiche concernée (« Enfant 2 : … », « Parent ou Tuteur : … »). */
function flatten(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const here = e.constraints ? Object.values(e.constraints) : [];
    let name = prefix;
    if (e.property === 'responsable') {
      name = pick({ fr: 'Parent ou Tuteur : ', en: 'Parent or Guardian: ' });
    } else if (/^\d+$/.test(e.property)) {
      name = pick({
        fr: `Enfant ${Number(e.property) + 1} : `,
        en: `Child ${Number(e.property) + 1}: `,
      });
    }
    return [
      ...here.map((m) => `${prefix}${m}`),
      ...(e.children?.length ? flatten(e.children, name) : []),
    ];
  });
}

/**
 * L'envoi arrive soit en JSON, soit en multipart (champ `payload` = le même JSON, plus une photo `photo_<rang>` par
 * enfant qui en joint une). Le corps multipart n'est pas un DTO : on le valide ici avec les mêmes règles.
 */
async function parseSubmission(
  body: Record<string, unknown>,
): Promise<SubmitFamilyDto> {
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
  const dto = plainToInstance(SubmitFamilyDto, raw);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) throw new BadRequestException(flatten(errors));
  return dto;
}

// Public : la page d'un lien de classe et l'envoi du formulaire. Personnel (ENROLLMENT_MANAGE, le droit de l'inscription,
// aucun droit nouveau) : liens, avancement, file de validation.
@Controller('family-collection')
export class FamilyCollectionController {
  constructor(
    private readonly collection: FamilyCollectionService,
    private readonly limiter: FamilySubmissionLimiter,
  ) {}

  @Public()
  @Get('public/:token')
  info(@Param('token') token: string) {
    return this.collection.publicInfo(token);
  }

  @Public()
  @Post('public/:token')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        files: MAX_FAMILY_CHILDREN,
        fileSize: MAX_FAMILY_PHOTO_BYTES,
        fields: 10,
        parts: MAX_FAMILY_CHILDREN + 10,
      },
    }),
  )
  async submit(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    // Derrière Caddy, l'adresse du parent est dans X-Forwarded-For (Caddy remplace toute valeur reçue du client).
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      'inconnue';
    this.limiter.assert(ip);
    const dto = await parseSubmission(body);
    const photos = (files ?? []).map((f) => {
      const match = /^photo_(\d+)$/.exec(f.fieldname);
      if (!match) {
        throw new BadRequestException(
          pick({
            fr: 'Fichier joint inattendu.',
            en: 'Unexpected attached file.',
          }),
        );
      }
      return { index: Number(match[1]), buffer: f.buffer };
    });
    return this.collection.submit(token, dto, photos);
  }

  @Get('classes')
  @RequirePermission('ENROLLMENT_MANAGE')
  classes() {
    return this.collection.classes();
  }

  @Get('classes/:classId')
  @RequirePermission('ENROLLMENT_MANAGE')
  classDetail(@Param('classId') classId: string) {
    return this.collection.classDetail(classId);
  }

  @Post('links/generate-all')
  @RequirePermission('ENROLLMENT_MANAGE')
  createAllLinks(@CurrentUser() user: CurrentUserData) {
    return this.collection.createAllLinks(user.id);
  }

  @Post('classes/:classId/link')
  @RequirePermission('ENROLLMENT_MANAGE')
  createLink(
    @Param('classId') classId: string,
    @Body() dto: CreateCollectLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.collection.createLink(classId, dto.regenerer === true, user.id);
  }

  @Patch('classes/:classId/link')
  @RequirePermission('ENROLLMENT_MANAGE')
  updateLink(
    @Param('classId') classId: string,
    @Body() dto: UpdateCollectLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.collection.updateLink(classId, dto, user.id);
  }

  @Post('classes/:classId/valider-simples')
  @RequirePermission('ENROLLMENT_MANAGE')
  validateSimple(
    @Param('classId') classId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.collection.validateSimple(classId, user.id);
  }

  @Get('submissions')
  @RequirePermission('ENROLLMENT_MANAGE')
  list(@Query() query: ListFamilySubmissionsQueryDto) {
    return this.collection.list(query);
  }

  // Photo envoyée par le parent, affichée pendant la validation : fichier privé, lu avec le jeton du personnel.
  @Get('children/:childId/photo')
  @RequirePermission('ENROLLMENT_MANAGE')
  async photo(
    @Param('childId') childId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.collection.childPhoto(childId);
    res.set({
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }

  @Get('children/:childId/analyse')
  @RequirePermission('ENROLLMENT_MANAGE')
  analyse(
    @Param('childId') childId: string,
    @Query() query: AnalyseFamilyChildQueryDto,
  ) {
    return this.collection.analyseChild(childId, query.studentId);
  }

  @Post('children/:childId/valider')
  @RequirePermission('ENROLLMENT_MANAGE')
  validate(
    @Param('childId') childId: string,
    @Body() dto: ValidateFamilyChildDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.collection.validate(childId, dto, user.id);
  }

  @Post('children/:childId/refuser')
  @RequirePermission('ENROLLMENT_MANAGE')
  refuse(
    @Param('childId') childId: string,
    @Body() dto: RefuseFamilyChildDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.collection.refuse(childId, dto.motif, user.id);
  }
}
