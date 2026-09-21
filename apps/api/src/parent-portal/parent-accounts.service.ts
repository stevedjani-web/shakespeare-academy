import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { generateActivationCode, hashCode, normalizeCode } from './parent-auth.util';
import { BulkCodesDto, SetLinkAccessDto } from './dto/parent.dto';

/** Au-delà, la génération en lot est refusée : on la fait classe par classe (lettres à imprimer, contrôle à l'œil). */
export const BULK_CODES_MAX_FAMILIES = 500;

export type ParentAccountState = 'SANS_COMPTE' | 'CODE_EN_ATTENTE' | 'ACTIF';

/** Inscription en cours : ACTIVE, dans l'année scolaire active. */
const CURRENT_ENROLLMENT = { statut: 'ACTIVE' as const, academicYear: { statut: 'ACTIVE' as const } };

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
  async list(search?: string, classId?: string, etat?: ParentAccountState) {
    const q = search?.trim();
    const now = new Date();
    const guardians = await this.prisma.guardian.findMany({
      where: {
        // « De cette classe » : un enfant à accès portail inscrit dans cette classe, cette année.
        ...(classId
          ? {
              studentGuardians: {
                some: { accesPortail: true, student: { enrollments: { some: { ...CURRENT_ENROLLMENT, classId } } } },
              },
            }
          : {}),
        ...(etat === 'ACTIF' ? { parentAccount: { is: { statut: 'ACTIF' as const } } } : {}),
        ...(etat === 'SANS_COMPTE' ? { parentAccount: { is: null } } : {}),
        ...(etat === 'CODE_EN_ATTENTE'
          ? { parentAccount: { is: null }, activationCodes: { some: { usedAt: null, expiresAt: { gt: now } } } }
          : {}),
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: 'insensitive' as const } },
                { prenom: { contains: q, mode: 'insensitive' as const } },
                { telephone: { contains: q } },
                {
                  studentGuardians: {
                    some: {
                      student: {
                        OR: [
                          { nom: { contains: q, mode: 'insensitive' as const } },
                          { prenom: { contains: q, mode: 'insensitive' as const } },
                          { matricule: { contains: q, mode: 'insensitive' as const } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 300,
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

  /**
   * Responsables « concernés » : au moins un enfant à accès portail, inscrit dans l'année active (dans la classe si
   * donnée). `sansAcces` compte ceux dont tous les liens sont retirés : ils n'ont rien à activer.
   */
  private async concernedGuardians(classId?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { ...CURRENT_ENROLLMENT, ...(classId ? { classId } : {}) },
      select: {
        class: { select: { id: true, nom: true } },
        student: { select: { studentGuardians: { select: { guardianId: true, accesPortail: true } } } },
      },
    });
    const withAccess = new Set<string>();
    const withoutAccess = new Set<string>();
    const byClass = new Map<string, { nom: string; guardians: Set<string> }>();
    for (const e of enrollments) {
      for (const link of e.student.studentGuardians) {
        if (!link.accesPortail) {
          withoutAccess.add(link.guardianId);
          continue;
        }
        withAccess.add(link.guardianId);
        const entry = byClass.get(e.class.id) ?? { nom: e.class.nom, guardians: new Set<string>() };
        entry.guardians.add(link.guardianId);
        byClass.set(e.class.id, entry);
      }
    }
    const sansAcces = [...withoutAccess].filter((id) => !withAccess.has(id)).length;
    return { withAccess, byClass, sansAcces };
  }

  /** Chiffres de la mise en service : où en sont les familles, au total et classe par classe. */
  async summary() {
    const { withAccess, byClass, sansAcces } = await this.concernedGuardians();
    const now = new Date();
    const guardians = await this.prisma.guardian.findMany({
      where: { id: { in: [...withAccess] } },
      select: {
        id: true,
        parentAccount: { select: { statut: true } },
        activationCodes: { where: { usedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 },
      },
    });
    type State = 'ACTIF' | 'DESACTIVE' | 'CODE_EN_ATTENTE' | 'SANS_CODE';
    const state = new Map<string, State>(
      guardians.map((g) => [
        g.id,
        g.parentAccount ? (g.parentAccount.statut === 'ACTIF' ? 'ACTIF' : 'DESACTIVE') : g.activationCodes.length > 0 ? 'CODE_EN_ATTENTE' : 'SANS_CODE',
      ]),
    );
    const count = (ids: Iterable<string>) => {
      const r = { total: 0, actifs: 0, desactives: 0, codesEnAttente: 0, sansCode: 0 };
      for (const id of ids) {
        r.total++;
        const s = state.get(id);
        if (s === 'ACTIF') r.actifs++;
        else if (s === 'DESACTIVE') r.desactives++;
        else if (s === 'CODE_EN_ATTENTE') r.codesEnAttente++;
        else r.sansCode++;
      }
      return r;
    };
    return {
      ...count(withAccess),
      sansAcces,
      classes: [...byClass.entries()]
        .map(([classId, c]) => ({ classId, classe: c.nom, ...count(c.guardians) }))
        .sort((a, b) => a.classe.localeCompare(b.classe, 'fr')),
    };
  }

  /**
   * Codes d'activation pour toute une classe (ou toute l'école), en une transaction. Un code par RESPONSABLE : une
   * famille de plusieurs enfants reçoit une seule lettre. Ne touche jamais un responsable qui a déjà un compte, ni
   * (sauf `regenerer`) un code encore valable : régénérer annulerait des lettres déjà imprimées. Les codes ne sont
   * renvoyés qu'ici, une seule fois (seule l'empreinte est conservée), et ne figurent dans aucun journal.
   */
  async bulkCodes(dto: BulkCodesDto, userId: string) {
    if (dto.classId) {
      const found = await this.prisma.class.findUnique({ where: { id: dto.classId }, select: { id: true } });
      if (!found) throw new NotFoundException('Classe introuvable.');
    }
    const school = await this.prisma.school.findFirstOrThrow({ select: { parentCodeValiditeJours: true } });
    const validiteJours = dto.validiteJours ?? school.parentCodeValiditeJours;
    const { withAccess, sansAcces } = await this.concernedGuardians(dto.classId);
    const now = new Date();

    const guardians = await this.prisma.guardian.findMany({
      where: { id: { in: [...withAccess] } },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        telephone: true,
        parentAccount: { select: { id: true } },
        activationCodes: { where: { usedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 },
        // Tous ses enfants inscrits cette année, quelle que soit leur classe : la lettre les liste tous.
        studentGuardians: {
          where: { accesPortail: true, student: { enrollments: { some: CURRENT_ENROLLMENT } } },
          select: {
            student: {
              select: {
                nom: true,
                prenom: true,
                enrollments: { where: CURRENT_ENROLLMENT, select: { class: { select: { nom: true } } }, take: 1 },
              },
            },
          },
        },
      },
    });

    let avecCompte = 0;
    let codeEnAttente = 0;
    const targets: typeof guardians = [];
    for (const g of guardians) {
      if (g.parentAccount) avecCompte++;
      else if (g.activationCodes.length > 0 && !dto.regenerer) codeEnAttente++;
      else targets.push(g);
    }
    if (targets.length > BULK_CODES_MAX_FAMILIES) {
      throw new UnprocessableEntityException(
        `Trop de familles (${targets.length}) pour une seule génération : choisissez une classe (maximum ${BULK_CODES_MAX_FAMILIES}).`,
      );
    }

    const expiresAt = new Date(now.getTime() + validiteJours * 24 * 60 * 60 * 1000);
    const generated = targets.map((g) => ({ g, code: generateActivationCode() }));
    await this.prisma.$transaction(
      generated.flatMap(({ g, code }) => [
        // Un seul code valable à la fois : l'éventuel précédent est invalidé (seulement possible avec `regenerer`).
        this.prisma.parentActivationCode.updateMany({
          where: { guardianId: g.id, usedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        }),
        this.prisma.parentActivationCode.create({
          data: { guardianId: g.id, codeHash: hashCode(normalizeCode(code)), expiresAt, createdById: userId },
        }),
      ]),
    );

    // Jamais un code dans le journal : la classe, le nombre, les identifiants et l'échéance suffisent.
    await this.log(userId, 'PARENT_CODES_BULK', 'Class', dto.classId ?? 'ECOLE', null, {
      classId: dto.classId ?? null,
      nombre: generated.length,
      guardianIds: generated.map(({ g }) => g.id),
      expireLe: expiresAt,
      regenerer: dto.regenerer === true,
      ignores: { avecCompte, codeEnAttente, sansAcces },
    });

    return {
      validiteJours,
      expireLe: expiresAt,
      generes: generated.map(({ g, code }) => ({
        guardianId: g.id,
        nom: g.nom,
        prenom: g.prenom,
        telephone: g.telephone,
        code,
        expireLe: expiresAt,
        enfants: g.studentGuardians.map((l) => ({
          prenom: l.student.prenom,
          nom: l.student.nom,
          classe: l.student.enrollments[0]?.class.nom ?? null,
        })),
      })),
      ignores: { avecCompte, codeEnAttente, sansAcces },
    };
  }
}
