import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NotificationType, ParentNotification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { toDateOnly } from '../pedagogy/pedagogy.util';
import { PUSH_SENDER, type PushSender } from './push-sender.interface';
import {
  PUSH_TITLE,
  absenceBody,
  canceledBody,
  coalescePolicy,
  mergedBody,
  notificationTitle,
  publishedBody,
  announcementBody,
  bulletinBody,
  messageReceivedBody,
  pushBody,
  replacedBody,
  retardBody,
  roomChangedBody,
} from './notification-texts';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'ABSENCE',
  'RETARD',
  'ENSEIGNANT_ABSENT',
  'EMPLOI_DU_TEMPS_MODIFIE',
  'MESSAGE_RECU',
  'ANNONCE',
  'BULLETIN_DISPONIBLE',
];

/** Un fait à signaler pour un élève, avant de savoir à quels responsables il sera adressé. */
interface Draft {
  studentId: string;
  prenom: string;
  type: NotificationType;
  /** Jour scolaire de l'événement (« AAAA-MM-JJ »). */
  jour: string;
  corps: string;
  /** Si renseigné, seul ce responsable est prévenu (un message ne concerne qu'un destinataire). */
  onlyGuardianId?: string;
}

export interface AttendanceItem {
  studentId: string;
  statut: 'ABSENT' | 'RETARD';
  minutesRetard: number | null;
  date: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
}

export interface SessionChange {
  kind: 'ANNULEE' | 'REMPLACEE' | 'SALLE_MODIFIEE';
  date: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
  salle?: string;
}

const PUSH_URL = '/parents/notifications';

/**
 * Notifications aux parents (Lot 12). Deux garanties structurantes :
 * - elles ne bloquent jamais l'action qui les déclenche : les points d'entrée `notify*` attrapent
 *   toute erreur, et l'envoi push part en arrière-plan après l'enregistrement du message ;
 * - elles ne fuient jamais : seuls les responsables ACTIFS, avec l'accès au portail non retiré pour
 *   CET enfant (RV08, D67), les reçoivent, et le canal externe reste générique (RV10).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  /** Attend la fin des envois push en cours (utile aux tests et à l'arrêt propre du serveur). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  private track(promise: Promise<unknown>) {
    this.inflight.add(promise);
    void promise.finally(() => this.inflight.delete(promise));
  }

  // ------------------------------------------------------------ Points d'entrée métier (ne lèvent jamais)

  /** Absences et retards saisis lors d'un appel (seulement ce qui vient de changer). */
  async notifyAttendance(items: AttendanceItem[]): Promise<void> {
    try {
      if (items.length === 0) return;
      const students = await this.prisma.student.findMany({
        where: { id: { in: items.map((i) => i.studentId) } },
        select: { id: true, prenom: true },
      });
      const prenom = new Map(students.map((s) => [s.id, s.prenom]));
      const drafts: Draft[] = items.map((i) => {
        const p = prenom.get(i.studentId) ?? 'votre enfant';
        return {
          studentId: i.studentId,
          prenom: p,
          type: i.statut === 'ABSENT' ? 'ABSENCE' : 'RETARD',
          jour: i.date,
          corps:
            i.statut === 'ABSENT'
              ? absenceBody({ prenom: p, ...i })
              : retardBody({ prenom: p, ...i }, i.minutesRetard),
        };
      });
      await this.deliver(drafts);
    } catch (err) {
      this.logger.error(
        `Notification d'assiduité non envoyée : ${(err as Error).message}`,
      );
    }
  }

  /** Changement ponctuel d'une séance : annulation, remplacement ou changement de salle. */
  async notifySessionChange(
    classId: string,
    change: SessionChange,
  ): Promise<void> {
    try {
      const school = await this.prisma.school.findFirstOrThrow({
        select: { fuseauHoraire: true },
      });
      // Un changement sur un jour déjà passé n'apprend rien à personne : pas d'alerte.
      if (change.date < dayInTimezone(new Date(), school.fuseauHoraire)) return;
      const students = await this.studentsOfClass(classId);
      const type: NotificationType =
        change.kind === 'SALLE_MODIFIEE'
          ? 'EMPLOI_DU_TEMPS_MODIFIE'
          : 'ENSEIGNANT_ABSENT';
      const drafts: Draft[] = students.map((s) => ({
        studentId: s.id,
        prenom: s.prenom,
        type,
        jour: change.date,
        corps:
          change.kind === 'ANNULEE'
            ? canceledBody({ prenom: s.prenom, ...change })
            : change.kind === 'REMPLACEE'
              ? replacedBody({ prenom: s.prenom, ...change })
              : roomChangedBody(
                  { prenom: s.prenom, ...change },
                  change.salle ?? '',
                ),
      }));
      await this.deliver(drafts);
    } catch (err) {
      this.logger.error(
        `Notification de changement de séance non envoyée : ${(err as Error).message}`,
      );
    }
  }

  /** Un message vient d'arriver pour un responsable précis. Le contenu n'est jamais transmis (RV10). */
  async notifyMessage(
    studentId: string,
    guardianId: string,
    from: string,
  ): Promise<void> {
    try {
      const [student, school] = await Promise.all([
        this.prisma.student.findUnique({
          where: { id: studentId },
          select: { id: true, prenom: true },
        }),
        this.prisma.school.findFirstOrThrow({
          select: { fuseauHoraire: true },
        }),
      ]);
      if (!student) return;
      await this.deliver([
        {
          studentId,
          prenom: student.prenom,
          type: 'MESSAGE_RECU',
          jour: dayInTimezone(new Date(), school.fuseauHoraire),
          corps: messageReceivedBody(student.prenom, from),
          onlyGuardianId: guardianId,
        },
      ]);
    } catch (err) {
      this.logger.error(
        `Notification de message non envoyée : ${(err as Error).message}`,
      );
    }
  }

  /** Une annonce est publiée pour une classe : les responsables de ses élèves sont prévenus (regroupé). */
  async notifyAnnouncement(classId: string, titre: string): Promise<void> {
    try {
      const school = await this.prisma.school.findFirstOrThrow({
        select: { fuseauHoraire: true },
      });
      const jour = dayInTimezone(new Date(), school.fuseauHoraire);
      const students = await this.studentsOfClass(classId);
      await this.deliver(
        students.map((s) => ({
          studentId: s.id,
          prenom: s.prenom,
          type: 'ANNONCE' as const,
          jour,
          corps: announcementBody(s.prenom, titre),
        })),
      );
    } catch (err) {
      this.logger.error(
        `Notification d'annonce non envoyée : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Un bulletin vient d'être publié pour ces élèves. Le texte ne dit jamais une note ni une moyenne (RV10) : le
   * détail reste dans l'application authentifiée.
   */
  async notifyBulletinPublished(
    students: Array<{ id: string; prenom: string }>,
    trimestre: string,
  ): Promise<void> {
    try {
      const school = await this.prisma.school.findFirstOrThrow({
        select: { fuseauHoraire: true },
      });
      const jour = dayInTimezone(new Date(), school.fuseauHoraire);
      await this.deliver(
        students.map((s) => ({
          studentId: s.id,
          prenom: s.prenom,
          type: 'BULLETIN_DISPONIBLE' as const,
          jour,
          corps: bulletinBody(s.prenom, trimestre),
        })),
      );
    } catch (err) {
      this.logger.error(
        `Notification de bulletin non envoyée : ${(err as Error).message}`,
      );
    }
  }

  /** Publication d'un nouvel emploi du temps : tous les élèves inscrits de l'année. */
  async notifyTimetablePublished(
    academicYearId: string,
    dateEffet: string,
  ): Promise<void> {
    try {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          academicYearId,
          statut: 'ACTIVE',
          student: { statut: 'ACTIF' },
        },
        select: { student: { select: { id: true, prenom: true } } },
      });
      const seen = new Set<string>();
      const drafts: Draft[] = [];
      for (const { student } of enrollments) {
        if (seen.has(student.id)) continue;
        seen.add(student.id);
        drafts.push({
          studentId: student.id,
          prenom: student.prenom,
          type: 'EMPLOI_DU_TEMPS_MODIFIE',
          jour: dateEffet,
          corps: publishedBody(student.prenom, dateEffet),
        });
      }
      await this.deliver(drafts);
    } catch (err) {
      this.logger.error(
        `Notification de publication non envoyée : ${(err as Error).message}`,
      );
    }
  }

  private async studentsOfClass(classId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
      select: { student: { select: { id: true, prenom: true } } },
    });
    const byId = new Map(enrollments.map((e) => [e.student.id, e.student]));
    return [...byId.values()];
  }

  // -------------------------------------------------------------------------------- Distribution

  /** Responsables qui doivent recevoir une notification pour chaque élève : actifs et avec accès. */
  private async recipients(
    studentIds: string[],
  ): Promise<Map<string, Array<{ accountId: string; guardianId: string }>>> {
    const links = await this.prisma.studentGuardian.findMany({
      where: {
        studentId: { in: studentIds },
        accesPortail: true,
        guardian: { parentAccount: { is: { statut: 'ACTIF' } } },
      },
      select: {
        studentId: true,
        guardianId: true,
        guardian: { select: { parentAccount: { select: { id: true } } } },
      },
    });
    const map = new Map<
      string,
      Array<{ accountId: string; guardianId: string }>
    >();
    for (const l of links) {
      const accountId = l.guardian.parentAccount?.id;
      if (!accountId) continue;
      map.set(l.studentId, [
        ...(map.get(l.studentId) ?? []),
        { accountId, guardianId: l.guardianId },
      ]);
    }
    return map;
  }

  private async deliver(drafts: Draft[]): Promise<void> {
    if (drafts.length === 0) return;
    const school = await this.prisma.school.findFirstOrThrow({
      select: { fuseauHoraire: true, notifGroupeMinutes: true },
    });
    const today = dayInTimezone(new Date(), school.fuseauHoraire);
    const recipients = await this.recipients([
      ...new Set(drafts.map((d) => d.studentId)),
    ]);
    const windowStart = new Date(
      Date.now() - school.notifGroupeMinutes * 60 * 1000,
    );
    const created: Array<{ row: ParentNotification; prenom: string }> = [];

    for (const draft of drafts) {
      for (const { accountId, guardianId } of recipients.get(draft.studentId) ??
        []) {
        if (draft.onlyGuardianId && draft.onlyGuardianId !== guardianId)
          continue;
        const policy = coalescePolicy(draft.type);
        const existing = await this.prisma.parentNotification.findFirst({
          where: {
            accountId,
            studentId: draft.studentId,
            type: draft.type,
            luAt: null,
            ...(policy === 'JOUR'
              ? { jour: toDateOnly(draft.jour) }
              : { createdAt: { gte: windowStart } }),
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          const count = existing.occurrences + 1;
          // Regroupée : le message dans l'application est complété, aucune nouvelle alerte n'est envoyée.
          await this.prisma.parentNotification.update({
            where: { id: existing.id },
            data: {
              occurrences: count,
              corps: mergedBody(
                draft.type,
                draft.prenom,
                count,
                policy === 'JOUR' ? draft.jour : today,
              ),
            },
          });
          continue;
        }
        const row = await this.prisma.parentNotification.create({
          data: {
            accountId,
            studentId: draft.studentId,
            type: draft.type,
            jour: toDateOnly(draft.jour),
            titre: notificationTitle(draft.type),
            corps: draft.corps,
          },
        });
        created.push({ row, prenom: draft.prenom });
      }
    }
    if (created.length > 0) this.track(this.pushAll(created));
  }

  /** Envoi push des nouvelles notifications, une alerte par responsable et par type d'événement. */
  private async pushAll(
    created: Array<{ row: ParentNotification; prenom: string }>,
  ): Promise<void> {
    try {
      const groups = new Map<
        string,
        Array<{ row: ParentNotification; prenom: string }>
      >();
      for (const c of created) {
        const key = `${c.row.accountId}|${c.row.type}`;
        groups.set(key, [...(groups.get(key) ?? []), c]);
      }
      const accountIds = [...new Set(created.map((c) => c.row.accountId))];
      const [prefs, subs] = await Promise.all([
        this.prisma.parentNotificationPreference.findMany({
          where: { accountId: { in: accountIds } },
        }),
        this.prisma.parentPushSubscription.findMany({
          where: { accountId: { in: accountIds } },
        }),
      ]);
      await Promise.all(
        [...groups.values()].map(async (group) => {
          const { accountId, type } = group[0].row;
          const ids = group.map((g) => g.row.id);
          const setStatus = (
            pushStatut: ParentNotification['pushStatut'],
            pushErreur: string | null = null,
          ) =>
            this.prisma.parentNotification.updateMany({
              where: { id: { in: ids } },
              data: { pushStatut, pushErreur },
            });

          try {
            const pref = prefs.find(
              (p) => p.accountId === accountId && p.type === type,
            );
            if (pref && !pref.push) return void (await setStatus('DESACTIVE'));
            const devices = subs.filter((s) => s.accountId === accountId);
            if (devices.length === 0)
              return void (await setStatus('AUCUN_APPAREIL'));

            const payload = {
              title: PUSH_TITLE,
              body: pushBody(
                type,
                group.map((g) => g.prenom),
              ),
              url: PUSH_URL,
              tag: `sa-${type}`,
            };
            const results = await Promise.all(
              devices.map(async (d) => ({
                d,
                r: await this.sender.send(
                  { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
                  payload,
                ),
              })),
            );
            const expired = results
              .filter((x) => x.r.expired)
              .map((x) => x.d.id);
            if (expired.length > 0)
              await this.prisma.parentPushSubscription.deleteMany({
                where: { id: { in: expired } },
              });
            if (results.some((x) => x.r.ok))
              return void (await setStatus('ENVOYE'));
            if (results.every((x) => x.r.expired))
              return void (await setStatus('AUCUN_APPAREIL'));
            await setStatus(
              'ECHEC',
              results.find((x) => !x.r.ok && !x.r.expired)?.r.error ??
                'Envoi impossible.',
            );
          } catch (err) {
            this.logger.error(
              `Alerte push non envoyée : ${(err as Error).message}`,
            );
            await setStatus(
              'ECHEC',
              (err as Error).message.slice(0, 200),
            ).catch(() => undefined);
          }
        }),
      );
    } catch (err) {
      this.logger.error(`Envoi push interrompu : ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------- Côté parent (portail)

  private async accessibleChildren(guardianId: string): Promise<string[]> {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  /**
   * Notifications d'un responsable. Une notification sur un enfant dont l'accès a été retiré
   * disparaît de la liste (RV08, D67) : elle contient le prénom et le détail de la séance.
   */
  async list(accountId: string, guardianId: string, limit = 50) {
    const children = await this.accessibleChildren(guardianId);
    const where = { accountId, studentId: { in: children } };
    const [rows, nonLues] = await Promise.all([
      this.prisma.parentNotification.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 100),
        include: { student: { select: { id: true, prenom: true } } },
      }),
      this.prisma.parentNotification.count({ where: { ...where, luAt: null } }),
    ]);
    return {
      nonLues,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        titre: r.titre,
        corps: r.corps,
        occurrences: r.occurrences,
        enfant: { id: r.student.id, prenom: r.student.prenom },
        lue: r.luAt !== null,
        date: r.updatedAt,
      })),
    };
  }

  async unreadCount(accountId: string, guardianId: string) {
    const children = await this.accessibleChildren(guardianId);
    const nonLues = await this.prisma.parentNotification.count({
      where: { accountId, studentId: { in: children }, luAt: null },
    });
    return { nonLues };
  }

  async markRead(accountId: string, id: string) {
    const found = await this.prisma.parentNotification.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Notification introuvable.');
    await this.prisma.parentNotification.updateMany({
      where: { id, luAt: null },
      data: { luAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(accountId: string) {
    const res = await this.prisma.parentNotification.updateMany({
      where: { accountId, luAt: null },
      data: { luAt: new Date() },
    });
    return { marquees: res.count };
  }

  async getPreferences(accountId: string) {
    const [prefs, appareils] = await Promise.all([
      this.prisma.parentNotificationPreference.findMany({
        where: { accountId },
      }),
      this.prisma.parentPushSubscription.count({ where: { accountId } }),
    ]);
    return {
      pushDisponible: this.sender.getPublicKey() !== null,
      appareils,
      preferences: NOTIFICATION_TYPES.map((type) => ({
        type,
        libelle: notificationTitle(type),
        // Sans ligne enregistrée, l'alerte push est activée par défaut.
        push: prefs.find((p) => p.type === type)?.push ?? true,
      })),
    };
  }

  async setPreferences(
    accountId: string,
    items: Array<{ type: NotificationType; push: boolean }>,
  ) {
    for (const item of items) {
      await this.prisma.parentNotificationPreference.upsert({
        where: { accountId_type: { accountId, type: item.type } },
        update: { push: item.push },
        create: { accountId, type: item.type, push: item.push },
      });
    }
    return this.getPreferences(accountId);
  }

  publicKey() {
    return { publicKey: this.sender.getPublicKey() };
  }

  /**
   * Enregistre l'appareil du parent connecté. Si ce même appareil était enregistré pour un autre
   * compte (téléphone partagé), il passe au compte qui vient de l'activer : les alertes suivent la
   * personne connectée, jamais la précédente.
   */
  async subscribe(
    accountId: string,
    sub: { endpoint: string; p256dh: string; auth: string },
  ) {
    await this.prisma.parentPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { accountId, p256dh: sub.p256dh, auth: sub.auth },
      create: { accountId, ...sub },
    });
    return { ok: true };
  }

  async unsubscribe(accountId: string, endpoint: string) {
    await this.prisma.parentPushSubscription.deleteMany({
      where: { accountId, endpoint },
    });
    return { ok: true };
  }
}
