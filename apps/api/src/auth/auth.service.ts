import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import ms from '../common/ms';

const MAX_TENTATIVES_CONNEXION = 5;
const DUREE_VERROUILLAGE_MINUTES = 15;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    nom: string;
    prenom: string;
    email: string;
    roleCode: string;
    doitChangerMotDePasse: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(email: string, motDePasse: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect.');
    }

    if (user.verrouilleJusqua && user.verrouilleJusqua > new Date()) {
      throw new ForbiddenException(
        `Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${user.verrouilleJusqua.toLocaleTimeString('fr-FR')}.`,
      );
    }

    if (user.statut !== 'ACTIF') {
      throw new ForbiddenException('Ce compte est désactivé.');
    }

    const motDePasseValide = await argon2.verify(
      user.motDePasseHash,
      motDePasse,
    );
    if (!motDePasseValide) {
      await this.enregistrerEchecConnexion(
        user.id,
        user.tentativesEchecsConnexion,
      );
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        tentativesEchecsConnexion: 0,
        verrouilleJusqua: null,
        dernierLoginAt: new Date(),
      },
    });

    await this.auditService.log({
      schoolId: user.schoolId,
      userId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      entite: 'User',
      entiteId: user.id,
    });

    const accessToken = await this.signAccessToken(user.id);
    const { refreshToken, refreshTokenExpiresAt } =
      await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        roleCode: user.role.code,
        doitChangerMotDePasse: user.doitChangerMotDePasse,
      },
    };
  }

  async refresh(rawRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
  }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Session expirée, veuillez vous reconnecter.',
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = await this.signAccessToken(stored.userId);
    const { refreshToken, refreshTokenExpiresAt } =
      await this.issueRefreshToken(stored.userId);

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    ancienMotDePasse: string,
    nouveauMotDePasse: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const valide = await argon2.verify(user.motDePasseHash, ancienMotDePasse);
    if (!valide) {
      throw new UnauthorizedException('Ancien mot de passe incorrect.');
    }
    const motDePasseHash = await this.hashPassword(nouveauMotDePasse);
    await this.prisma.user.update({
      where: { id: userId },
      data: { motDePasseHash, doitChangerMotDePasse: false },
    });
  }

  async hashPassword(motDePasse: string): Promise<string> {
    return argon2.hash(motDePasse, { type: argon2.argon2id });
  }

  private async enregistrerEchecConnexion(
    userId: string,
    tentativesActuelles: number,
  ): Promise<void> {
    const tentatives = tentativesActuelles + 1;
    const verrouille = tentatives >= MAX_TENTATIVES_CONNEXION;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tentativesEchecsConnexion: verrouille ? 0 : tentatives,
        verrouilleJusqua: verrouille
          ? new Date(Date.now() + DUREE_VERROUILLAGE_MINUTES * 60_000)
          : null,
      },
    });
  }

  private async signAccessToken(userId: string): Promise<string> {
    const ttlSeconds = Math.floor(
      ms(process.env.JWT_ACCESS_TTL ?? '15m') / 1000,
    );
    return this.jwtService.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: ttlSeconds,
      },
    );
  }

  private async issueRefreshToken(
    userId: string,
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const ttlMs = ms(process.env.JWT_REFRESH_TTL ?? '7d');
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { refreshToken: rawToken, refreshTokenExpiresAt: expiresAt };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
