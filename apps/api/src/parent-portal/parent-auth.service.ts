import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { pick } from '../common/language';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import ms from '../common/ms';
import {
  CONSENT_VERSION,
  MAX_CODE_ATTEMPTS,
  hashCode,
  normalizeCode,
  parentTokenSecret,
  samePhone,
} from './parent-auth.util';
import { ActivateDto } from './dto/parent.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Messages montrés au parent : dans la langue de sa requête (Accept-Language), le français par défaut.
const genericLoginError = () =>
  pick({
    fr: 'Numéro ou mot de passe incorrect.',
    en: 'Incorrect number or password.',
  });
const genericCodeError = () =>
  pick({
    fr: 'Numéro ou code d’activation incorrect, ou code expiré. Demandez un nouveau code au secrétariat.',
    en: 'Incorrect number or activation code, or the code has expired. Ask the school office for a new code.',
  });
const invalidSession = () =>
  pick({
    fr: 'Session invalide ou expirée.',
    en: 'Invalid or expired session.',
  });
const sessionExpired = () =>
  pick({
    fr: 'Session expirée, veuillez vous reconnecter.',
    en: 'Your session has expired, please sign in again.',
  });

export interface ParentSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  // nom/prenom facultatifs depuis le 22 septembre 2026 (Guardian) : un compte peut exister avec un
  // nom encore incomplet. telephone reste requis ici : la session n'existe que pour un responsable
  // retrouvé par ce numéro (samePhone), donc toujours renseigné à ce stade.
  parent: {
    id: string;
    nom: string | null;
    prenom: string | null;
    telephone: string;
    /** Langue choisie (« fr » ou « en »), vide tant que le parent n'a pas choisi. */
    langue: string | null;
  };
}

/**
 * Authentification des responsables. Volontairement séparée de celle du personnel : autre table, autre
 * clé de signature, autre cookie. Le compte n'existe qu'après activation par un code remis par l'école (D66).
 */
@Injectable()
export class ParentAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(
    action: string,
    entiteId: string,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId: null,
      action,
      entite: 'ParentAccount',
      entiteId,
      nouvelleValeur,
    });
  }

  private async guardiansWithPhone(telephone: string) {
    const all = await this.prisma.guardian.findMany({
      select: { id: true, nom: true, prenom: true, telephone: true },
    });
    return all.filter((g) => samePhone(g.telephone, telephone));
  }

  consentInfo() {
    return { version: CONSENT_VERSION };
  }

  // ---------------------------------------------------------------------- Activation

  /**
   * Crée (ou réinitialise) le compte d'un responsable avec le code remis par le secrétariat. Les messages
   * d'erreur ne distinguent jamais « numéro inconnu » de « code faux » : rien ne permet de deviner quels
   * numéros sont enregistrés. Un code se brûle après quelques essais faux.
   */
  async activate(dto: ActivateDto): Promise<ParentSession> {
    if (!dto.consentement) {
      throw new BadRequestException(
        pick({
          fr: 'Vous devez accepter la politique de confidentialité pour activer votre compte.',
          en: 'You must accept the privacy policy to activate your account.',
        }),
      );
    }
    if (dto.versionPolitique !== CONSENT_VERSION) {
      throw new BadRequestException(
        pick({
          fr: 'La politique de confidentialité a changé : rechargez la page et relisez-la.',
          en: 'The privacy policy has changed: reload the page and read it again.',
        }),
      );
    }
    const guardians = await this.guardiansWithPhone(dto.telephone);
    const codes = guardians.length
      ? await this.prisma.parentActivationCode.findMany({
          where: {
            guardianId: { in: guardians.map((g) => g.id) },
            usedAt: null,
            expiresAt: { gt: new Date() },
            tentatives: { lt: MAX_CODE_ATTEMPTS },
          },
        })
      : [];
    const wanted = hashCode(normalizeCode(dto.code));
    const match = codes.find((c) => c.codeHash === wanted);
    if (!match) {
      if (codes.length > 0) {
        await this.prisma.parentActivationCode.updateMany({
          where: { id: { in: codes.map((c) => c.id) } },
          data: { tentatives: { increment: 1 } },
        });
      }
      throw new UnauthorizedException(genericCodeError());
    }

    const guardian = guardians.find((g) => g.id === match.guardianId)!;
    const motDePasseHash = await argon2.hash(dto.motDePasse, {
      type: argon2.argon2id,
    });
    const account = await this.prisma.$transaction(async (tx) => {
      // Le code se consomme et ceux qui restaient pour ce responsable tombent avec lui.
      await tx.parentActivationCode.update({
        where: { id: match.id },
        data: { usedAt: new Date() },
      });
      await tx.parentActivationCode.updateMany({
        where: { guardianId: guardian.id, usedAt: null },
        data: { expiresAt: new Date() },
      });
      const saved = await tx.parentAccount.upsert({
        where: { guardianId: guardian.id },
        create: {
          guardianId: guardian.id,
          motDePasseHash,
          dernierLoginAt: new Date(),
        },
        update: {
          motDePasseHash,
          statut: 'ACTIF',
          tentativesEchecsConnexion: 0,
          verrouilleJusqua: null,
          dernierLoginAt: new Date(),
        },
      });
      // Un nouveau mot de passe ferme toutes les sessions ouvertes avec l'ancien.
      await tx.parentRefreshToken.updateMany({
        where: { accountId: saved.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.parentConsent.create({
        data: { accountId: saved.id, version: dto.versionPolitique },
      });
      return saved;
    });
    await this.log('PARENT_ACCOUNT_ACTIVATE', account.id, {
      guardianId: guardian.id,
      consentement: dto.versionPolitique,
    });
    return this.openSession(account.id, guardian);
  }

  // -------------------------------------------------------------------------- Login

  async login(telephone: string, motDePasse: string): Promise<ParentSession> {
    const guardians = await this.guardiansWithPhone(telephone);
    const accounts = guardians.length
      ? await this.prisma.parentAccount.findMany({
          where: { guardianId: { in: guardians.map((g) => g.id) } },
        })
      : [];
    const account = accounts[0];
    if (!account) {
      throw new UnauthorizedException(genericLoginError());
    }
    if (account.verrouilleJusqua && account.verrouilleJusqua > new Date()) {
      throw new ForbiddenException(
        pick({
          fr: `Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${account.verrouilleJusqua.toLocaleTimeString('fr-FR')}.`,
          en: `Account temporarily locked after several failed attempts. Try again after ${account.verrouilleJusqua.toLocaleTimeString('en-GB')}.`,
        }),
      );
    }
    if (account.statut !== 'ACTIF') {
      throw new ForbiddenException(
        pick({
          fr: "Ce compte est désactivé. Contactez le secrétariat de l'école.",
          en: 'This account is disabled. Contact the school office.',
        }),
      );
    }
    if (!(await argon2.verify(account.motDePasseHash, motDePasse))) {
      const attempts = account.tentativesEchecsConnexion + 1;
      const lock = attempts >= MAX_LOGIN_ATTEMPTS;
      await this.prisma.parentAccount.update({
        where: { id: account.id },
        data: {
          tentativesEchecsConnexion: lock ? 0 : attempts,
          verrouilleJusqua: lock
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : null,
        },
      });
      throw new UnauthorizedException(genericLoginError());
    }
    await this.prisma.parentAccount.update({
      where: { id: account.id },
      data: {
        tentativesEchecsConnexion: 0,
        verrouilleJusqua: null,
        dernierLoginAt: new Date(),
      },
    });
    await this.log('PARENT_LOGIN_SUCCESS', account.id);
    return this.openSession(
      account.id,
      guardians.find((g) => g.id === account.guardianId)!,
    );
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.parentRefreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(sessionExpired());
    }
    const account = await this.prisma.parentAccount.findUnique({
      where: { id: stored.accountId },
    });
    if (!account || account.statut !== 'ACTIF') {
      throw new UnauthorizedException(sessionExpired());
    }
    await this.prisma.parentRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await this.signAccessToken(stored.accountId);
    return { accessToken, ...(await this.issueRefreshToken(stored.accountId)) };
  }

  async logout(rawRefreshToken: string) {
    await this.prisma.parentRefreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(accountId: string, ancien: string, nouveau: string) {
    const account = await this.prisma.parentAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (!(await argon2.verify(account.motDePasseHash, ancien))) {
      throw new UnauthorizedException(
        pick({
          fr: 'Ancien mot de passe incorrect.',
          en: 'Current password is incorrect.',
        }),
      );
    }
    if (ancien === nouveau) {
      throw new ForbiddenException(
        pick({
          fr: "Le nouveau mot de passe doit être différent de l'ancien.",
          en: 'The new password must be different from the current one.',
        }),
      );
    }
    await this.prisma.parentAccount.update({
      where: { id: accountId },
      data: {
        motDePasseHash: await argon2.hash(nouveau, { type: argon2.argon2id }),
      },
    });
    await this.log('PARENT_PASSWORD_CHANGE', accountId);
  }

  // ------------------------------------------------------------------------- Jetons

  /** Vérifie un jeton d'accès de parent et renvoie l'identité, ou refuse. */
  async verifyAccessToken(
    token: string,
  ): Promise<{ accountId: string; guardianId: string }> {
    let payload: { sub?: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; typ?: string }>(
        token,
        { secret: parentTokenSecret() },
      );
    } catch {
      throw new UnauthorizedException(invalidSession());
    }
    if (payload.typ !== 'parent' || !payload.sub) {
      throw new UnauthorizedException(invalidSession());
    }
    const account = await this.prisma.parentAccount.findUnique({
      where: { id: payload.sub },
    });
    if (!account || account.statut !== 'ACTIF') {
      throw new UnauthorizedException(
        pick({
          fr: 'Compte introuvable ou désactivé.',
          en: 'Account not found or disabled.',
        }),
      );
    }
    return { accountId: account.id, guardianId: account.guardianId };
  }

  private async openSession(
    accountId: string,
    guardian: {
      id: string;
      nom: string | null;
      prenom: string | null;
      telephone: string | null;
    },
  ): Promise<ParentSession> {
    // Invariant : ce responsable n'a été retrouvé que par correspondance de téléphone (samePhone),
    // qui refuse toujours un téléphone absent — jamais atteint en pratique, gardé pour ne jamais
    // mentir sur le type de ParentSession.parent.telephone.
    if (!guardian.telephone) {
      throw new UnauthorizedException(genericLoginError());
    }
    const account = await this.prisma.parentAccount.findUnique({
      where: { id: accountId },
      select: { langue: true },
    });
    return {
      accessToken: await this.signAccessToken(accountId),
      ...(await this.issueRefreshToken(accountId)),
      parent: {
        id: accountId,
        nom: guardian.nom,
        prenom: guardian.prenom,
        telephone: guardian.telephone,
        langue: account?.langue ?? null,
      },
    };
  }

  async setLanguage(accountId: string, langue: string): Promise<void> {
    await this.prisma.parentAccount.update({
      where: { id: accountId },
      data: { langue },
    });
  }

  private async signAccessToken(accountId: string): Promise<string> {
    const ttlSeconds = Math.floor(
      ms(process.env.JWT_ACCESS_TTL ?? '15m') / 1000,
    );
    return this.jwt.signAsync(
      { sub: accountId, typ: 'parent' },
      { secret: parentTokenSecret(), expiresIn: ttlSeconds },
    );
  }

  private async issueRefreshToken(accountId: string) {
    const rawToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(
      Date.now() + ms(process.env.JWT_REFRESH_TTL ?? '7d'),
    );
    await this.prisma.parentRefreshToken.create({
      data: { accountId, tokenHash: this.hashToken(rawToken), expiresAt },
    });
    return { refreshToken: rawToken, refreshTokenExpiresAt: expiresAt };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
