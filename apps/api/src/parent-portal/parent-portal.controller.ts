import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ParentAuthService, type ParentSession } from './parent-auth.service';
import { ParentPortalService } from './parent-portal.service';
import { ParentAuthGuard, type ParentIdentity } from './parent-auth.guard';
import { ActivateDto, ParentChangePasswordDto, ParentLoginDto, WeekQueryDto } from './dto/parent.dto';

const REFRESH_COOKIE = 'parent_refresh_token';
const REFRESH_PATH = '/portal';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_PATH,
    expires: expiresAt,
  });
}

function sessionBody(res: Response, s: ParentSession) {
  setRefreshCookie(res, s.refreshToken, s.refreshTokenExpiresAt);
  return { accessToken: s.accessToken, parent: s.parent };
}

type ParentRequest = Request & { parent: ParentIdentity };

// Authentification du portail : publique pour la garde du personnel, sans jeton de parent (on s'y connecte).
@Public()
@Controller('portal')
export class ParentAuthController {
  constructor(private readonly auth: ParentAuthService) {}

  @Get('consent-info')
  consentInfo() {
    return this.auth.consentInfo();
  }

  @Post('activate')
  async activate(@Body() dto: ActivateDto, @Res({ passthrough: true }) res: Response) {
    return sessionBody(res, await this.auth.activate(dto));
  }

  @Post('login')
  async login(@Body() dto: ParentLoginDto, @Res({ passthrough: true }) res: Response) {
    return sessionBody(res, await this.auth.login(dto.telephone, dto.motDePasse));
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new UnauthorizedException('Aucune session à renouveler.');
    const result = await this.auth.refresh(raw);
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { success: true };
  }
}

// Données du portail : uniquement avec un jeton de parent (garde dédiée), jamais celui du personnel.
@Public()
@UseGuards(ParentAuthGuard)
@Controller('portal')
export class ParentPortalController {
  constructor(
    private readonly portal: ParentPortalService,
    private readonly auth: ParentAuthService,
  ) {}

  @Get('me')
  me(@Req() req: ParentRequest) {
    return this.portal.me(req.parent.guardianId);
  }

  @Patch('change-password')
  async changePassword(@Req() req: ParentRequest, @Body() dto: ParentChangePasswordDto) {
    await this.auth.changePassword(req.parent.accountId, dto.ancienMotDePasse, dto.nouveauMotDePasse);
    return { success: true };
  }

  @Get('children/:studentId/timetable')
  timetable(@Req() req: ParentRequest, @Param('studentId') studentId: string, @Query() q: WeekQueryDto) {
    return this.portal.timetable(req.parent.guardianId, studentId, q.date);
  }

  @Get('children/:studentId/attendance')
  attendance(@Req() req: ParentRequest, @Param('studentId') studentId: string) {
    return this.portal.attendanceOf(req.parent.guardianId, studentId);
  }

  @Get('children/:studentId/finance')
  finance(@Req() req: ParentRequest, @Param('studentId') studentId: string) {
    return this.portal.financeOf(req.parent.guardianId, studentId);
  }
}
