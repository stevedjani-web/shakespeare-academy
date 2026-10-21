import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Inscription en cours : ACTIVE, dans l'année scolaire active. */
const CURRENT_ENROLLMENT = {
  statut: 'ACTIVE' as const,
  academicYear: { statut: 'ACTIVE' as const },
};

const DAY = 24 * 60 * 60 * 1000;
export const ACTIVITY_MAX_DAYS = 365;
export const ACTIVITY_DEFAULT_DAYS = 30;
export const LOGIN_HISTORY_MAX = 500;

const ACCOUNT_INCLUDE = {
  guardian: {
    select: {
      nom: true,
      prenom: true,
      telephone: true,
      studentGuardians: {
        where: { accesPortail: true },
        select: {
          student: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              matricule: true,
              enrollments: {
                where: CURRENT_ENROLLMENT,
                select: { class: { select: { nom: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Activité des parents dans l'espace parents : qui s'est connecté, quand, combien de fois, et qui ne l'a jamais fait
 * (les familles à relancer). Lecture seule : tout vient des comptes (`dernierLoginAt`) et du journal d'audit, où chaque
 * connexion réussie est déjà écrite (`PARENT_LOGIN_SUCCESS`). Une connexion = un mot de passe saisi : un parent qui reste
 * connecté sur son téléphone (la session se renouvelle seule) n'ajoute pas de ligne.
 */
@Injectable()
export class ParentActivityService {
  constructor(private readonly prisma: PrismaService) {}

  private clampDays(days?: number): number {
    if (!days || !Number.isFinite(days)) return ACTIVITY_DEFAULT_DAYS;
    return Math.min(Math.max(Math.trunc(days), 1), ACTIVITY_MAX_DAYS);
  }

  /** Les enfants d'un compte avec leur classe de l'année active, sans aucune donnée sensible. */
  private children(account: {
    guardian: {
      studentGuardians: Array<{
        student: {
          id: string;
          nom: string;
          prenom: string;
          matricule: string;
          enrollments: Array<{ class: { nom: string } }>;
        };
      }>;
    };
  }) {
    return account.guardian.studentGuardians.map((l) => ({
      id: l.student.id,
      nom: l.student.nom,
      prenom: l.student.prenom,
      matricule: l.student.matricule,
      classe: l.student.enrollments[0]?.class.nom ?? null,
    }));
  }

  async overview(daysInput?: number) {
    const days = this.clampDays(daysInput);
    const now = Date.now();
    const since = new Date(now - days * DAY);

    const [accounts, perAccount] = await Promise.all([
      this.prisma.parentAccount.findMany({ include: ACCOUNT_INCLUDE }),
      this.prisma.auditLog.groupBy({
        by: ['entiteId'],
        where: {
          action: 'PARENT_LOGIN_SUCCESS',
          entite: 'ParentAccount',
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
    ]);
    const countOf = new Map(
      perAccount.map((r) => [r.entiteId, r._count._all] as const),
    );

    const parents = accounts
      .map((a) => ({
        accountId: a.id,
        nom: a.guardian.nom,
        prenom: a.guardian.prenom,
        telephone: a.guardian.telephone,
        statut: a.statut,
        activeLe: a.activatedAt,
        dernierLoginAt: a.dernierLoginAt,
        connexions: countOf.get(a.id) ?? 0,
        enfants: this.children(a),
      }))
      // Les plus récemment connectés d'abord, ceux qui ne se sont jamais connectés à la fin.
      .sort(
        (x, y) =>
          (y.dernierLoginAt?.getTime() ?? -1) -
          (x.dernierLoginAt?.getTime() ?? -1),
      );

    const actifs = parents.filter((p) => p.statut === 'ACTIF');
    const within = (p: { dernierLoginAt: Date | null }, d: number) =>
      p.dernierLoginAt !== null && p.dernierLoginAt.getTime() >= now - d * DAY;
    return {
      jours: days,
      resume: {
        comptes: parents.length,
        actifs: actifs.length,
        // Comptes ouverts mais jamais utilisés : ce sont eux qu'on relance.
        jamaisConnectes: actifs.filter((p) => p.dernierLoginAt === null).length,
        connectes24h: actifs.filter((p) => within(p, 1)).length,
        connectes7j: actifs.filter((p) => within(p, 7)).length,
        connectes30j: actifs.filter((p) => within(p, 30)).length,
        connectesPeriode: actifs.filter((p) => p.connexions > 0).length,
        // Déjà venus un jour, mais pas pendant la période choisie.
        inactifsPeriode: actifs.filter(
          (p) => p.dernierLoginAt !== null && p.connexions === 0,
        ).length,
        connexionsPeriode: parents.reduce((s, p) => s + p.connexions, 0),
      },
      parents,
    };
  }

  /** Historique des connexions, les plus récentes d'abord. */
  async logins(daysInput?: number, limitInput?: number) {
    const days = this.clampDays(daysInput);
    const limit = Math.min(
      Math.max(Math.trunc(limitInput ?? 200) || 200, 1),
      LOGIN_HISTORY_MAX,
    );
    const since = new Date(Date.now() - days * DAY);
    const where = {
      action: 'PARENT_LOGIN_SUCCESS',
      entite: 'ParentAccount',
      createdAt: { gte: since },
    };
    const [total, events] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, createdAt: true, entiteId: true },
      }),
    ]);
    const ids = [
      ...new Set(events.map((e) => e.entiteId).filter((x): x is string => !!x)),
    ];
    const accounts = ids.length
      ? await this.prisma.parentAccount.findMany({
          where: { id: { in: ids } },
          include: ACCOUNT_INCLUDE,
        })
      : [];
    const byId = new Map(accounts.map((a) => [a.id, a] as const));
    return {
      jours: days,
      total,
      affiches: events.length,
      evenements: events.map((e) => {
        const a = e.entiteId ? byId.get(e.entiteId) : undefined;
        return {
          id: e.id,
          le: e.createdAt,
          accountId: e.entiteId,
          nom: a?.guardian.nom ?? null,
          prenom: a?.guardian.prenom ?? null,
          telephone: a?.guardian.telephone ?? null,
          enfants: a ? this.children(a) : [],
        };
      }),
    };
  }
}
