import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { PreRegistrationsService } from './pre-registrations.service';
import {
  AcceptPreRegistrationDto,
  CreatePreRegistrationDto,
  ListPreRegistrationsQueryDto,
  MAX_CHILDREN,
  RejectPreRegistrationDto,
  TrackPreRegistrationQueryDto,
} from './dto/pre-registration.dto';
import { MAX_BULLETIN_BYTES } from './preregistration-files';
import { SubmissionRateLimiter } from './submission-rate-limiter';
import { pick } from '../common/language';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

/** Messages de validation à plat, avec le nom de la fiche concernée (« Enfant 2 : … », « Parent / Tuteur : … »). */
function flatten(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const here = e.constraints ? Object.values(e.constraints) : [];
    let name = prefix;
    if (e.property === 'responsable') {
      name = pick({ fr: 'Parent / Tuteur : ', en: 'Parent / Guardian: ' });
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
 * Le dépôt arrive soit en JSON, soit en multipart (champ `payload` = le JSON, un fichier `bulletin_<rang>` par enfant qui
 * joint son bulletin). Le corps multipart n'est pas un DTO : on le valide ici avec les mêmes règles.
 */
async function parseSubmission(
  body: Record<string, unknown>,
): Promise<CreatePreRegistrationDto> {
  let raw: unknown = body;
  if (typeof body?.payload === 'string') {
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException(
        pick({
          fr: 'La demande est illisible.',
          en: 'The request cannot be read.',
        }),
      );
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      pick({ fr: 'La demande est vide.', en: 'The request is empty.' }),
    );
  }
  const dto = plainToInstance(CreatePreRegistrationDto, raw);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) throw new BadRequestException(flatten(errors));
  return dto;
}

// Public : niveaux, dépôt d'une demande, suivi par référence + téléphone. Personnel (ENROLLMENT_MANAGE, le même
// droit que l'inscription manuelle, aucun droit nouveau) : liste, détail, accepter, refuser, lire un bulletin.
@Controller('preinscriptions')
export class PreRegistrationsController {
  constructor(
    private readonly preRegistrations: PreRegistrationsService,
    private readonly limiter: SubmissionRateLimiter,
  ) {}

  @Public()
  @Get('niveaux')
  niveaux() {
    return this.preRegistrations.publicLevelTree();
  }

  @Public()
  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        files: MAX_CHILDREN,
        fileSize: MAX_BULLETIN_BYTES,
        fields: 10,
        parts: MAX_CHILDREN + 10,
      },
    }),
  )
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    // Derrière Caddy, l'adresse de la famille est dans X-Forwarded-For (Caddy remplace toute valeur reçue du client).
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      'inconnue';
    this.limiter.assert(ip);

    const dto = await parseSubmission(body);
    const bulletins = (files ?? []).map((f) => {
      const match = /^bulletin_(\d+)$/.exec(f.fieldname);
      if (!match) {
        throw new BadRequestException(
          pick({
            fr: 'Fichier joint inattendu.',
            en: 'Unexpected attached file.',
          }),
        );
      }
      return {
        index: Number(match[1]),
        buffer: f.buffer,
        originalname: f.originalname,
      };
    });
    return this.preRegistrations.create(dto, bulletins);
  }

  @Public()
  @Get('suivi')
  track(@Query() query: TrackPreRegistrationQueryDto) {
    return this.preRegistrations.track(query.reference, query.telephone);
  }

  @Get()
  @RequirePermission('ENROLLMENT_MANAGE')
  list(@Query() query: ListPreRegistrationsQueryDto) {
    return this.preRegistrations.list(query.statut);
  }

  // Les routes d'une fiche enfant précèdent `:id` (un identifiant de demande) pour ne jamais se confondre avec lui.
  @Get('enfants/:childId/bulletin')
  @RequirePermission('ENROLLMENT_MANAGE')
  async bulletin(
    @Param('childId') childId: string,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.preRegistrations.bulletinFile(childId, user.id);
    res.set({
      'Content-Type': file.type,
      // Nom affiché encodé (RFC 5987) : jamais un nom brut dans l'en-tête.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.nom)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(file.path));
  }

  @Post('enfants/:childId/accepter')
  @RequirePermission('ENROLLMENT_MANAGE')
  accept(
    @Param('childId') childId: string,
    @Body() dto: AcceptPreRegistrationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.preRegistrations.accept(childId, dto, user.id);
  }

  @Post('enfants/:childId/rejeter')
  @RequirePermission('ENROLLMENT_MANAGE')
  reject(
    @Param('childId') childId: string,
    @Body() dto: RejectPreRegistrationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.preRegistrations.reject(childId, dto.motif, user.id);
  }

  @Get(':id')
  @RequirePermission('ENROLLMENT_MANAGE')
  findOne(@Param('id') id: string) {
    return this.preRegistrations.findOne(id);
  }
}
