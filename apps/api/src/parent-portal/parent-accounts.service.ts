import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { generateActivationCode, hashCode, normalizeCode } from './parent-auth.util';
import { SetLinkAccessDto } from './dto/parent.dto';

/** Gestion des comptes parents par l'école : codes d'activation, désactivation, retrait d'accès (D66, D67). */
@Injectable()
export class ParentAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(userId: string, action: string, entite: string, entiteId: string, ancienne?: unknown, nouvelle?: unknown) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      ancienneValeur: ancienne,
      nouvelleValeur: nouvelle,
    });
  }

  /** Responsables avec l'état de leur compte, et leurs enfants avec l'accès accordé ou retiré. */
  async list(search?: string) {
    const q = search?.trim();
    const guardians = await this.prisma.guardian.findMany({
      where: q
        ? {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { telephone: { contains: q } },
              {
                studentGuardians: {
                  some: {
                    student: {
                      OR: [
                        { nom: { contains: q, mode: 'insensitive' } },
                        { prenom: { contains: q, mode: 'insensitive' } },
                        { matricule: { contains: q, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : undefined,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 100,
      include: {
        studentGuardians: { include: { student: { select: { id: true, nom: true, prenom: true, matricule: true } } } },
        parentAccount: { include: { consents: { orderBy: { acceptedAt: 'desc' }, take: 1 } } },
        activationCodes: { where: { usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return guardians.map((g) => ({
      id: g.id,
      nom: g.nom,
      prenom: g.prenom,
      telephone: g.telephone,
      compte: g.parentAccount
        ? {
            statut: g.parentAccount.statut,
            activeLe: g.parentAccount.activatedAt,
            dernierLoginAt: g.parentAccount.dernierLoginAt,
            consentement: g.parentAccount.consents[0]
              ? { version: g.parentAccount.consents[0].version, le: g.parentAccount.consents[0].acceptedAt }
              : null,
          }
        : null,
      codeEnAttente: g.activationCodes[0] ? { expireLe: g.activationCodes[0].expiresAt } : null,
      enfants: g.studentGuardians.map((l) => ({
        liaisonId: l.id,
        studentId: l.student.id,
        nom: l.student.nom,
        prenom: l.student.prenom,
        matricule: l.student.matricule,
        lien: l.lien,
        accesPortail: l.accesPortail,
        accesMotif: l.accesMotif,
      })),
    }));
  }

  /**
   * Nouveau code d'activation pour un responsable (première activation, ou mot de passe oublié : le même code
   * réinitialise le compte). Le code n'est montré qu'ici, une seule fois : seule son empreinte est conservée.
   */
  async generateCode(guardianId: string, userId: string) {
    const guardian = await this.prisma.guardian.findUnique({ where: { id: guardianId } });
    if (!guardian) throw new NotFoundException('Responsable introuvable.');
    const school = await this.prisma.school.findFirstOrThrow({ select: { parentCodeValiditeJours: true } });
    const expiresAt = new Date(Date.now() + school.parentCodeValiditeJours * 24 * 60 * 60 * 1000);
    const code = generateActivationCode();
    await this.prisma.$transaction([
      // Un seul code valable à la fois : le précédent est invalidé.
      this.prisma.parentActivationCode.updateMany({
        where: { guardianId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() },
      }),
      this.prisma.parentActivationCode.create({
        data: { guardianId, codeHash: hashCode(normalizeCode(code)), expiresAt, createdById: userId },
      }),
    ]);
    await this.log(userId, 'PARENT_CODE_GENERATE', 'Guardian', guardianId, null, { expireLe: expiresAt }); // jamais le code
    return { code, expireLe: expiresAt, telephone: guardian.telephone };
  }

  async setAccountActive(guardianId: string, actif: boolean, userId: string) {
    const account = await this.prisma.parentAccount.findUnique({ where: { guardianId } });
    if (!account) throw new NotFoundException("Ce responsable n'a pas de compte parent.");
    const statut = actif ? 'ACTIF' : 'INACTIF';
    await this.prisma.parentAccount.update({ where: { id: account.id }, data: { statut } });
    if (!actif) {
      // Les sessions ouvertes tombent tout de suite : le jeton d'accès est aussi refusé (compte inactif).
      await this.prisma.parentRefreshToken.updateMany({ where: { accountId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.log(userId, actif ? 'PARENT_ACCOUNT_REACTIVATE' : 'PARENT_ACCOUNT_DEACTIVATE', 'ParentAccount', account.id, account.statut, statut);
    return { statut };
  }

  /** D67 : retirer ou rétablir l'accès d'un responsable pour UN élève, avec motif et trace. */
  async setLinkAccess(linkId: string, dto: SetLinkAccessDto, userId: string) {
    const link = await this.prisma.studentGuardian.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Lien introuvable.');
    const updated = await this.prisma.studentGuardian.update({
      where: { id: linkId },
      data: { accesPortail: dto.acces, accesModifieAt: new Date(), accesMotif: dto.motif.trim() },
    });
    await this.log(
      userId,
      dto.acces ? 'PARENT_LINK_ACCESS_RESTORE' : 'PARENT_LINK_ACCESS_REVOKE',
      'StudentGuardian',
      linkId,
      { accesPortail: link.accesPortail },
      { accesPortail: dto.acces, motif: dto.motif.trim(), studentId: link.studentId, guardianId: link.guardianId },
    );
    return { accesPortail: updated.accesPortail };
  }
}
