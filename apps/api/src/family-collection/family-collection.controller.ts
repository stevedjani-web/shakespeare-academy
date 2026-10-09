import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FamilyCollectionService } from './family-collection.service';
import { FamilySubmissionLimiter } from './family-submission-limiter';
import {
  AnalyseFamilyChildQueryDto,
  CreateCollectLinkDto,
  ListFamilySubmissionsQueryDto,
  RefuseFamilyChildDto,
  SubmitFamilyDto,
  UpdateCollectLinkDto,
  ValidateFamilyChildDto,
} from './dto/family-collection.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

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
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitFamilyDto,
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
    return this.collection.submit(token, dto);
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
