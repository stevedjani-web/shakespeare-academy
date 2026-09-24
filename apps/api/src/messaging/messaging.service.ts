import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MessageAuthor, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService } from '../notifications/notifications.service';
import { cleanText, excerpt, looksLikePhoneNumber } from './messaging.util';

export interface Actor {
  id: string;
  permissions: string[];
  nom: string;
  prenom: string;
}

const SCHOOL_LABEL = "L'école";
const THREAD_MESSAGES_LIMIT = 300;
// Bandeau d'alerte de l'espace parents : au plus trois messages, cent caractères chacun.
const PREVIEW_MAX_MESSAGES = 3;
const PREVIEW_EXCERPT_LENGTH = 100;

// Le responsable (Guardian) a un nom/prénom facultatifs depuis le 22 septembre 2026 (contrairement à
// un compte du personnel, User, toujours renseigné) : repli sur « Responsable » si aucun n'est saisi.
const fullName = (p: { prenom: string | null; nom: string | null }) => {
  const parts = [p.prenom, p.nom].filter((v): v is string => !!v?.trim());
  return parts.length > 0 ? parts.join(' ') : 'Responsable';
};

/**
 * Messagerie sécurisée (Lot 13). La règle centrale (RV09, D72) est vérifiée côté serveur à chaque
 * ouverture de conversation ET à chaque envoi :
 * - un enseignant et un responsable ne se parlent que si l'enseignant est affecté à la classe actuelle
 *   de l'enfant et que le responsable a accès à cet enfant (RV08) ;
 * - la Direction et la vie scolaire (le « guichet de l'école ») peuvent écrire à tout responsable ;
 * - jamais de parent à parent, texte seul, aucun numéro de téléphone échangé ni affiché (aucune réponse
 *   de ce service ne contient le téléphone ou l'e-mail d'une personne).
 * La Direction peut lire une conversation (D73), et chaque lecture est journalisée (RV11).
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------- Outils communs

  private async log(
    userId: string | null,
    action: string,
    entite: string,
    entiteId: string,
    nouvelleValeur?: unknown,
  ) {
    // Jamais le texte d'un message dans le journal : seulement qui a fait quoi, sur quoi.
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      ancienneValeur: null,
      nouvelleValeur,
    });
  }

  private isDesk(actor: Actor) {
    return actor.permissions.includes('MESSAGE_DESK');
  }

  private isSupervisor(actor: Actor) {
    return actor.permissions.includes('MESSAGE_SUPERVISE');
  }

  /** Texte validé : nettoyé, non vide, et sans rien qui ressemble à un numéro de téléphone (RV09). */
  private async validText(raw: string): Promise<string> {
    const texte = cleanText(raw);
    if (!texte)
      throw new BadRequestException('Le message ne peut pas être vide.');
    const school = await this.prisma.school.findFirstOrThrow({
      select: { messageNumeroMinChiffres: true },
    });
    if (looksLikePhoneNumber(texte, school.messageNumeroMinChiffres)) {
      throw new UnprocessableEntityException(
        "Ce message contient ce qui ressemble à un numéro de téléphone. Les numéros personnels ne s'échangent pas dans la messagerie : écrivez votre demande, l'école ou l'enseignant vous répondra ici.",
      );
    }
    return texte;
  }

  private currentEnrollment(studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: { studentId, statut: 'ACTIVE' },
      orderBy: { academicYear: { dateDebut: 'desc' } },
      include: { class: { select: { id: true, nom: true } } },
    });
  }

  private teacherOf(userId: string) {
    return this.prisma.teacher.findUnique({ where: { userId } });
  }

  /** Enseignants actifs, avec un compte, affectés à cette classe : les seuls qu'un parent peut joindre. */
  private async teachersOfClass(classId: string) {
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { classId, teacher: { statut: 'ACTIF', userId: { not: null } } },
      include: { teacher: true, subject: { select: { nom: true } } },
      orderBy: { subject: { nom: 'asc' } },
    });
    const byTeacher = new Map<
      string,
      {
        id: string;
        userId: string;
        nom: string;
        prenom: string;
        matieres: string[];
      }
    >();
    for (const a of assignments) {
      const entry = byTeacher.get(a.teacherId) ?? {
        id: a.teacher.id,
        userId: a.teacher.userId as string,
        nom: a.teacher.nom,
        prenom: a.teacher.prenom,
        matieres: [],
      };
      entry.matieres.push(a.subject.nom);
      byTeacher.set(a.teacherId, entry);
    }
    return [...byTeacher.values()];
  }

  /** Cet enseignant est-il, aujourd'hui, affecté à la classe actuelle de cet enfant ? (RV09) */
  private async teacherCanReach(
    userId: string,
    studentId: string,
  ): Promise<boolean> {
    const teacher = await this.teacherOf(userId);
    if (!teacher || teacher.statut !== 'ACTIF') return false;
    const enrollment = await this.currentEnrollment(studentId);
    if (!enrollment) return false;
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId: teacher.id, classId: enrollment.classId },
      select: { id: true },
    });
    return assignment !== null;
  }

  /** Le responsable a-t-il un compte actif et l'accès à cet enfant ? */
  private async guardianReachable(guardianId: string, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
      include: {
        guardian: { include: { parentAccount: { select: { statut: true } } } },
      },
    });
    if (!link)
      throw new NotFoundException(
        'Ce responsable n’est pas rattaché à cet élève.',
      );
    if (!link.accesPortail || link.guardian.parentAccount?.statut !== 'ACTIF') {
      throw new UnprocessableEntityException(
        "Ce responsable n'a pas de compte actif ou n'a pas accès à cet élève : il ne pourrait pas lire votre message.",
      );
    }
    return link;
  }

  private async assertParentChild(guardianId: string, studentId: string) {
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    // « Introuvable » plutôt que « interdit » : on ne confirme pas l'existence d'un élève d'une autre famille.
    if (!link || !link.accesPortail)
      throw new NotFoundException('Élève introuvable.');
  }

  private async addMessage(
    threadId: string,
    auteur: MessageAuthor,
    auteurUserId: string | null,
    raw: string,
  ) {
    const texte = await this.validText(raw);
    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, auteur, auteurUserId, texte, createdAt: now },
      }),
      this.prisma.messageThread.update({
        where: { id: threadId },
        // L'auteur a forcément lu la conversation jusqu'ici.
        data: {
          dernierMessageAt: now,
          ...(auteur === 'PARENT'
            ? { parentLuAt: now }
            : { personnelLuAt: now }),
        },
      }),
    ]);
    return message;
  }

  /** Les messages tels que les voit un participant : un message retiré n'est plus lisible, la trace reste. */
  private presentForParticipant(
    messages: Array<
      Prisma.MessageGetPayload<{
        include: {
          auteurUser: { select: { nom: true; prenom: true } };
          reports: true;
        };
      }>
    >,
    viewer: 'PARENT' | 'PERSONNEL',
    ctx: {
      guardianName: string;
      ecole: boolean;
      myGuardianId?: string;
      myUserId?: string;
    },
  ) {
    return messages.map((m) => {
      const mine = m.auteur === viewer;
      const author =
        m.auteur === 'PARENT'
          ? mine
            ? 'Vous'
            : ctx.guardianName
          : ctx.ecole && viewer === 'PARENT'
            ? SCHOOL_LABEL
            : mine
              ? 'Vous'
              : m.auteurUser
                ? fullName(m.auteurUser)
                : SCHOOL_LABEL;
      const reportedByMe = m.reports.some((r) =>
        viewer === 'PARENT'
          ? r.signaleParGuardianId === ctx.myGuardianId
          : r.signaleParUserId === ctx.myUserId,
      );
      return {
        id: m.id,
        moi: mine,
        auteur: author,
        texte: m.retireAt ? null : m.texte,
        retire: m.retireAt !== null,
        date: m.createdAt,
        signale: reportedByMe,
      };
    });
  }

  private static readonly MESSAGE_INCLUDE = {
    auteurUser: { select: { nom: true, prenom: true } },
    reports: true,
  } satisfies Prisma.MessageInclude;

  // ================================================================================ Côté parent

  /** Interlocuteurs qu'un responsable peut joindre à propos d'un enfant : les enseignants de sa classe, et l'école. */
  async parentContacts(guardianId: string, studentId: string) {
    await this.assertParentChild(guardianId, studentId);
    const enrollment = await this.currentEnrollment(studentId);
    const teachers = enrollment
      ? await this.teachersOfClass(enrollment.classId)
      : [];
    return {
      classe: enrollment?.class.nom ?? null,
      // Ni téléphone ni e-mail : le nom et les matières suffisent pour choisir.
      enseignants: teachers.map((t) => ({
        id: t.id,
        nom: t.nom,
        prenom: t.prenom,
        matieres: t.matieres,
      })),
      ecole: true,
    };
  }

  async parentThreads(guardianId: string) {
    const [school, links] = await Promise.all([
      this.prisma.school.findFirstOrThrow({
        select: { messageDelaiReponseJours: true },
      }),
      this.prisma.studentGuardian.findMany({
        where: { guardianId, accesPortail: true },
        select: { studentId: true },
      }),
    ]);
    const threads = await this.prisma.messageThread.findMany({
      where: { guardianId, studentId: { in: links.map((l) => l.studentId) } },
      orderBy: { dernierMessageAt: 'desc' },
      include: {
        student: { select: { id: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            auteur: true,
            texte: true,
            retireAt: true,
            createdAt: true,
          },
        },
      },
    });
    const items = await Promise.all(
      threads.map(async (t) => {
        const unread = await this.prisma.message.count({
          where: {
            threadId: t.id,
            auteur: 'PERSONNEL',
            ...(t.parentLuAt ? { createdAt: { gt: t.parentLuAt } } : {}),
          },
        });
        const last = t.messages[0];
        return {
          id: t.id,
          enfant: t.student,
          interlocuteur:
            t.type === 'ECOLE'
              ? SCHOOL_LABEL
              : fullName(t.staffUser as { prenom: string; nom: string }),
          nonLus: unread,
          dernierMessage: last
            ? {
                auteur: last.auteur,
                apercu: last.retireAt ? null : last.texte.slice(0, 120),
                date: last.createdAt,
              }
            : null,
        };
      }),
    );
    return {
      delaiReponseJours: school.messageDelaiReponseJours,
      threads: items,
    };
  }

  async parentUnreadCount(guardianId: string) {
    const { threads } = await this.parentThreads(guardianId);
    return { nonLus: threads.reduce((sum, t) => sum + t.nonLus, 0) };
  }

  /**
   * Aperçu des messages non lus pour le bandeau d'alerte de l'espace parents : les plus récents d'abord, un
   * extrait court (jamais le texte entier), sans les messages retirés par la Direction ni les enfants dont
   * l'accès est retiré. Le responsable est celui du jeton, aucun autre paramètre n'est accepté.
   */
  async parentUnreadPreview(guardianId: string) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      select: { studentId: true },
    });
    const threads = await this.prisma.messageThread.findMany({
      where: { guardianId, studentId: { in: links.map((l) => l.studentId) } },
      include: {
        student: { select: { id: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
      },
    });
    const perThread = await Promise.all(
      threads.map(async (t) => {
        const unread = {
          threadId: t.id,
          auteur: 'PERSONNEL' as const,
          retireAt: null,
          ...(t.parentLuAt ? { createdAt: { gt: t.parentLuAt } } : {}),
        };
        const [total, latest] = await Promise.all([
          this.prisma.message.count({ where: unread }),
          this.prisma.message.findMany({
            where: unread,
            orderBy: { createdAt: 'desc' },
            take: PREVIEW_MAX_MESSAGES,
            select: { id: true, texte: true, createdAt: true },
          }),
        ]);
        return { thread: t, total, latest };
      }),
    );
    const withUnread = perThread.filter((x) => x.total > 0);
    const messages = withUnread
      .flatMap(({ thread, latest }) =>
        latest.map((m) => ({
          id: m.id,
          threadId: thread.id,
          enfant: thread.student,
          expediteur:
            thread.type === 'ECOLE'
              ? SCHOOL_LABEL
              : fullName(thread.staffUser as { prenom: string; nom: string }),
          extrait: excerpt(m.texte, PREVIEW_EXCERPT_LENGTH),
          date: m.createdAt,
        })),
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, PREVIEW_MAX_MESSAGES);
    return {
      total: withUnread.reduce((sum, x) => sum + x.total, 0),
      threads: withUnread.length,
      messages,
    };
  }

  private async parentThreadOrThrow(guardianId: string, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        student: { select: { id: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
        guardian: { select: { nom: true, prenom: true } },
      },
    });
    if (!thread || thread.guardianId !== guardianId)
      throw new NotFoundException('Conversation introuvable.');
    await this.assertParentChild(guardianId, thread.studentId);
    return thread;
  }

  async parentThread(guardianId: string, threadId: string) {
    const thread = await this.parentThreadOrThrow(guardianId, threadId);
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: THREAD_MESSAGES_LIMIT,
      include: MessagingService.MESSAGE_INCLUDE,
    });
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { parentLuAt: new Date() },
    });
    const canReply =
      thread.type === 'ECOLE' ||
      (thread.staffUserId
        ? await this.teacherCanReach(thread.staffUserId, thread.studentId)
        : false);
    const school = await this.prisma.school.findFirstOrThrow({
      select: { messageDelaiReponseJours: true },
    });
    return {
      id: thread.id,
      enfant: thread.student,
      interlocuteur:
        thread.type === 'ECOLE'
          ? SCHOOL_LABEL
          : fullName(thread.staffUser as { prenom: string; nom: string }),
      peutRepondre: canReply,
      delaiReponseJours: school.messageDelaiReponseJours,
      messages: this.presentForParticipant(messages, 'PARENT', {
        guardianName: fullName(thread.guardian),
        ecole: thread.type === 'ECOLE',
        myGuardianId: guardianId,
      }),
    };
  }

  async parentCreateThread(
    guardianId: string,
    dto: {
      studentId: string;
      teacherId?: string;
      ecole?: boolean;
      texte: string;
    },
  ) {
    await this.assertParentChild(guardianId, dto.studentId);
    if (Boolean(dto.teacherId) === Boolean(dto.ecole)) {
      throw new BadRequestException(
        "Choisissez un enseignant de la classe, ou l'école (l'un des deux).",
      );
    }
    let staffUserId: string | null = null;
    if (dto.teacherId) {
      const enrollment = await this.currentEnrollment(dto.studentId);
      const teachers = enrollment
        ? await this.teachersOfClass(enrollment.classId)
        : [];
      const teacher = teachers.find((t) => t.id === dto.teacherId);
      // RV09 : un enseignant qui n'est pas affecté à la classe de l'enfant ne peut pas être joint.
      if (!teacher)
        throw new ForbiddenException(
          "Cet enseignant n'est pas affecté à la classe de votre enfant.",
        );
      staffUserId = teacher.userId;
    }
    const type = staffUserId ? 'ENSEIGNANT' : 'ECOLE';
    // Valider le texte avant de créer quoi que ce soit : un message refusé ne laisse pas de conversation vide.
    await this.validText(dto.texte);
    const existing = await this.prisma.messageThread.findFirst({
      where: { studentId: dto.studentId, guardianId, type, staffUserId },
    });
    const thread =
      existing ??
      (await this.prisma.messageThread.create({
        data: {
          studentId: dto.studentId,
          guardianId,
          type,
          staffUserId,
          createdByType: 'PARENT',
        },
      }));
    await this.addMessage(thread.id, 'PARENT', null, dto.texte);
    await this.log(
      null,
      'MESSAGE_THREAD_CREATE',
      'MessageThread',
      thread.id,
      existing
        ? undefined
        : { par: 'PARENT', guardianId, studentId: dto.studentId, type },
    );
    return this.parentThread(guardianId, thread.id);
  }

  async parentSend(guardianId: string, threadId: string, texte: string) {
    const thread = await this.parentThreadOrThrow(guardianId, threadId);
    if (thread.type === 'ENSEIGNANT') {
      const reachable = thread.staffUserId
        ? await this.teacherCanReach(thread.staffUserId, thread.studentId)
        : false;
      if (!reachable) {
        throw new UnprocessableEntityException(
          "Cet enseignant n'est plus affecté à la classe de votre enfant. Écrivez à l'école.",
        );
      }
    }
    await this.addMessage(threadId, 'PARENT', null, texte);
    return this.parentThread(guardianId, threadId);
  }

  async parentReport(guardianId: string, messageId: string, motif?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { thread: true },
    });
    if (!message || message.thread.guardianId !== guardianId)
      throw new NotFoundException('Message introuvable.');
    await this.assertParentChild(guardianId, message.thread.studentId);
    if (message.auteur === 'PARENT')
      throw new UnprocessableEntityException(
        'Vous ne pouvez signaler que les messages reçus.',
      );
    return this.createReport(messageId, { type: 'PARENT', guardianId }, motif);
  }

  // ================================================================================ Côté personnel

  /** Classes où l'acteur peut écrire : celles de l'enseignant, ou toutes pour le guichet de l'école. */
  async staffClasses(actor: Actor) {
    if (this.isDesk(actor)) {
      const classes = await this.prisma.class.findMany({
        include: {
          academicYear: { select: { libelle: true, dateDebut: true } },
        },
        orderBy: [{ academicYear: { dateDebut: 'desc' } }, { nom: 'asc' }],
      });
      return classes.map((c) => ({
        id: c.id,
        nom: c.nom,
        anneeScolaire: c.academicYear.libelle,
      }));
    }
    const teacher = await this.teacherOf(actor.id);
    if (!teacher) return [];
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { teacherId: teacher.id },
      include: {
        class: {
          include: {
            academicYear: { select: { libelle: true, dateDebut: true } },
          },
        },
      },
    });
    const byId = new Map(assignments.map((a) => [a.classId, a.class]));
    return [...byId.values()]
      .sort(
        (a, b) =>
          b.academicYear.dateDebut.getTime() -
            a.academicYear.dateDebut.getTime() || a.nom.localeCompare(b.nom),
      )
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        anneeScolaire: c.academicYear.libelle,
      }));
  }

  private async assertCanUseClass(actor: Actor, classId: string) {
    if (this.isDesk(actor)) return;
    const teacher = await this.teacherOf(actor.id);
    const assigned = teacher
      ? await this.prisma.teachingAssignment.findFirst({
          where: { teacherId: teacher.id, classId },
          select: { id: true },
        })
      : null;
    if (!teacher || teacher.statut !== 'ACTIF' || !assigned) {
      throw new ForbiddenException("Vous n'êtes pas affecté à cette classe.");
    }
  }

  /** Élèves d'une classe et leurs responsables joignables (compte actif, accès accordé). Noms et lien seulement. */
  async staffRecipients(actor: Actor, classId: string) {
    await this.assertCanUseClass(actor, classId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
      include: {
        student: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            studentGuardians: {
              where: {
                accesPortail: true,
                guardian: { parentAccount: { is: { statut: 'ACTIF' } } },
              },
              select: {
                lien: true,
                guardian: { select: { id: true, nom: true, prenom: true } },
              },
            },
          },
        },
      },
      orderBy: { student: { nom: 'asc' } },
    });
    return enrollments.map((e) => ({
      id: e.student.id,
      nom: e.student.nom,
      prenom: e.student.prenom,
      responsables: e.student.studentGuardians.map((g) => ({
        id: g.guardian.id,
        nom: g.guardian.nom,
        prenom: g.guardian.prenom,
        lien: g.lien,
      })),
    }));
  }

  private threadWhereForStaff(actor: Actor): Prisma.MessageThreadWhereInput {
    return this.isDesk(actor)
      ? { OR: [{ type: 'ECOLE' }, { staffUserId: actor.id }] }
      : { type: 'ENSEIGNANT', staffUserId: actor.id };
  }

  async staffThreads(actor: Actor) {
    const threads = await this.prisma.messageThread.findMany({
      where: this.threadWhereForStaff(actor),
      orderBy: { dernierMessageAt: 'desc' },
      take: 200,
      include: {
        student: { select: { id: true, nom: true, prenom: true } },
        guardian: { select: { id: true, nom: true, prenom: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            auteur: true,
            texte: true,
            retireAt: true,
            createdAt: true,
          },
        },
      },
    });
    const links = await this.prisma.studentGuardian.findMany({
      where: {
        OR: threads.map((t) => ({
          studentId: t.studentId,
          guardianId: t.guardianId,
        })),
      },
      select: { studentId: true, guardianId: true, lien: true },
    });
    return Promise.all(
      threads.map(async (t) => {
        const unread = await this.prisma.message.count({
          where: {
            threadId: t.id,
            auteur: 'PARENT',
            ...(t.personnelLuAt ? { createdAt: { gt: t.personnelLuAt } } : {}),
          },
        });
        const last = t.messages[0];
        return {
          id: t.id,
          type: t.type,
          enfant: t.student,
          responsable: {
            nom: t.guardian.nom,
            prenom: t.guardian.prenom,
            lien:
              links.find(
                (l) =>
                  l.studentId === t.studentId && l.guardianId === t.guardianId,
              )?.lien ?? null,
          },
          nonLus: unread,
          dernierMessage: last
            ? {
                auteur: last.auteur,
                apercu: last.retireAt ? null : last.texte.slice(0, 120),
                date: last.createdAt,
              }
            : null,
        };
      }),
    );
  }

  async staffUnreadCount(actor: Actor) {
    const threads = await this.staffThreads(actor);
    return { nonLus: threads.reduce((sum, t) => sum + t.nonLus, 0) };
  }

  private async staffThreadOrThrow(actor: Actor, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        student: { select: { id: true, nom: true, prenom: true } },
        guardian: { select: { id: true, nom: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
      },
    });
    const allowed =
      thread !== null &&
      (thread.type === 'ENSEIGNANT'
        ? thread.staffUserId === actor.id
        : this.isDesk(actor) || thread.staffUserId === actor.id);
    if (!thread || !allowed)
      throw new NotFoundException('Conversation introuvable.');
    return thread;
  }

  async staffThread(actor: Actor, threadId: string) {
    const thread = await this.staffThreadOrThrow(actor, threadId);
    const [messages, link] = await Promise.all([
      this.prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        take: THREAD_MESSAGES_LIMIT,
        include: MessagingService.MESSAGE_INCLUDE,
      }),
      this.prisma.studentGuardian.findUnique({
        where: {
          studentId_guardianId: {
            studentId: thread.studentId,
            guardianId: thread.guardianId,
          },
        },
        include: {
          guardian: {
            include: { parentAccount: { select: { statut: true } } },
          },
        },
      }),
    ]);
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { personnelLuAt: new Date() },
    });
    const parentReachable = Boolean(
      link?.accesPortail && link.guardian.parentAccount?.statut === 'ACTIF',
    );
    const teacherOk =
      thread.type === 'ECOLE' ||
      (await this.teacherCanReach(actor.id, thread.studentId));
    return {
      id: thread.id,
      type: thread.type,
      enfant: thread.student,
      responsable: {
        nom: thread.guardian.nom,
        prenom: thread.guardian.prenom,
        lien: link?.lien ?? null,
      },
      peutRepondre: parentReachable && teacherOk,
      messages: this.presentForParticipant(messages, 'PERSONNEL', {
        guardianName: `${fullName(thread.guardian)}${link ? ` (${link.lien})` : ''}`,
        ecole: false,
        myUserId: actor.id,
      }),
    };
  }

  async staffCreateThread(
    actor: Actor,
    dto: { studentId: string; guardianId: string; texte: string },
  ) {
    await this.guardianReachable(dto.guardianId, dto.studentId);
    const desk = this.isDesk(actor);
    if (!desk && !(await this.teacherCanReach(actor.id, dto.studentId))) {
      // RV09 : un enseignant n'écrit qu'aux responsables des élèves de sa classe.
      throw new ForbiddenException(
        "Vous n'êtes pas affecté à la classe de cet élève : vous ne pouvez pas écrire à son responsable.",
      );
    }
    await this.validText(dto.texte);
    const type = desk ? 'ECOLE' : 'ENSEIGNANT';
    const staffUserId = desk ? null : actor.id;
    const existing = await this.prisma.messageThread.findFirst({
      where: {
        studentId: dto.studentId,
        guardianId: dto.guardianId,
        type,
        staffUserId,
      },
    });
    const thread =
      existing ??
      (await this.prisma.messageThread.create({
        data: {
          studentId: dto.studentId,
          guardianId: dto.guardianId,
          type,
          staffUserId,
          createdByType: 'PERSONNEL',
        },
      }));
    await this.addMessage(thread.id, 'PERSONNEL', actor.id, dto.texte);
    await this.log(
      actor.id,
      'MESSAGE_THREAD_CREATE',
      'MessageThread',
      thread.id,
      existing
        ? undefined
        : {
            par: 'PERSONNEL',
            guardianId: dto.guardianId,
            studentId: dto.studentId,
            type,
          },
    );
    await this.notifications.notifyMessage(
      dto.studentId,
      dto.guardianId,
      desk ? SCHOOL_LABEL : fullName(actor),
    );
    return this.staffThread(actor, thread.id);
  }

  async staffSend(actor: Actor, threadId: string, texte: string) {
    const thread = await this.staffThreadOrThrow(actor, threadId);
    if (
      thread.type === 'ENSEIGNANT' &&
      !(await this.teacherCanReach(actor.id, thread.studentId))
    ) {
      throw new ForbiddenException(
        "Vous n'êtes plus affecté à la classe de cet élève : vous ne pouvez plus écrire à son responsable.",
      );
    }
    await this.guardianReachable(thread.guardianId, thread.studentId);
    await this.addMessage(threadId, 'PERSONNEL', actor.id, texte);
    await this.notifications.notifyMessage(
      thread.studentId,
      thread.guardianId,
      thread.type === 'ECOLE' ? SCHOOL_LABEL : fullName(actor),
    );
    return this.staffThread(actor, threadId);
  }

  async staffReport(actor: Actor, messageId: string, motif?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { thread: true },
    });
    if (!message) throw new NotFoundException('Message introuvable.');
    await this.staffThreadOrThrow(actor, message.threadId);
    if (message.auteur === 'PERSONNEL')
      throw new UnprocessableEntityException(
        'Vous ne pouvez signaler que les messages reçus des responsables.',
      );
    return this.createReport(
      messageId,
      { type: 'PERSONNEL', userId: actor.id },
      motif,
    );
  }

  private async createReport(
    messageId: string,
    by:
      | { type: 'PARENT'; guardianId: string }
      | { type: 'PERSONNEL'; userId: string },
    motif?: string,
  ) {
    const existing = await this.prisma.messageReport.findFirst({
      where: {
        messageId,
        traiteAt: null,
        ...(by.type === 'PARENT'
          ? { signaleParGuardianId: by.guardianId }
          : { signaleParUserId: by.userId }),
      },
    });
    if (existing) return { ok: true, dejaSignale: true };
    const report = await this.prisma.messageReport.create({
      data: {
        messageId,
        signaleParType: by.type,
        signaleParGuardianId: by.type === 'PARENT' ? by.guardianId : null,
        signaleParUserId: by.type === 'PERSONNEL' ? by.userId : null,
        motif: motif?.trim() || null,
      },
    });
    await this.log(
      by.type === 'PERSONNEL' ? by.userId : null,
      'MESSAGE_REPORT',
      'MessageReport',
      report.id,
      {
        messageId,
        par: by.type,
        ...(by.type === 'PARENT' ? { guardianId: by.guardianId } : {}),
      },
    );
    return { ok: true, dejaSignale: false };
  }

  // ============================================================================== Supervision (D73)

  /** Liste des conversations : uniquement des repères (qui, quel élève, combien, quand), jamais le texte. */
  async supervisionThreads(search?: string) {
    const q = search?.trim();
    const threads = await this.prisma.messageThread.findMany({
      where: q
        ? {
            OR: [
              {
                student: {
                  OR: [
                    { nom: { contains: q, mode: 'insensitive' } },
                    { prenom: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
              {
                guardian: {
                  OR: [
                    { nom: { contains: q, mode: 'insensitive' } },
                    { prenom: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
              {
                staffUser: {
                  OR: [
                    { nom: { contains: q, mode: 'insensitive' } },
                    { prenom: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {},
      orderBy: { dernierMessageAt: 'desc' },
      take: 200,
      include: {
        student: { select: { nom: true, prenom: true } },
        guardian: { select: { nom: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
        _count: { select: { messages: true } },
        messages: {
          select: {
            reports: { where: { traiteAt: null }, select: { id: true } },
          },
        },
      },
    });
    return threads.map((t) => ({
      id: t.id,
      type: t.type,
      enfant: fullName(t.student),
      responsable: fullName(t.guardian),
      interlocuteur: t.staffUser ? fullName(t.staffUser) : SCHOOL_LABEL,
      nombreMessages: t._count.messages,
      dernierMessageAt: t.dernierMessageAt,
      signalementsOuverts: t.messages.reduce((n, m) => n + m.reports.length, 0),
    }));
  }

  /** Lecture d'une conversation par la Direction : chaque lecture est journalisée (RV11). */
  async supervisionThread(actor: Actor, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        student: { select: { nom: true, prenom: true } },
        guardian: { select: { nom: true, prenom: true } },
        staffUser: { select: { nom: true, prenom: true } },
      },
    });
    if (!thread) throw new NotFoundException('Conversation introuvable.');
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: THREAD_MESSAGES_LIMIT,
      include: {
        auteurUser: { select: { nom: true, prenom: true } },
        retirePar: { select: { nom: true, prenom: true } },
        reports: { select: { id: true, traiteAt: true } },
      },
    });
    await this.log(
      actor.id,
      'MESSAGE_SUPERVISED_READ',
      'MessageThread',
      threadId,
      {
        messages: messages.length,
        responsableId: thread.guardianId,
        eleveId: thread.studentId,
      },
    );
    return {
      id: thread.id,
      type: thread.type,
      enfant: fullName(thread.student),
      responsable: fullName(thread.guardian),
      interlocuteur: thread.staffUser
        ? fullName(thread.staffUser)
        : SCHOOL_LABEL,
      messages: messages.map((m) => ({
        id: m.id,
        auteur:
          m.auteur === 'PARENT'
            ? fullName(thread.guardian)
            : m.auteurUser
              ? fullName(m.auteurUser)
              : SCHOOL_LABEL,
        cote: m.auteur,
        // La Direction voit le texte d'origine d'un message retiré, avec le motif du retrait.
        texte: m.texte,
        date: m.createdAt,
        retire: m.retireAt
          ? {
              le: m.retireAt,
              par: m.retirePar ? fullName(m.retirePar) : null,
              motif: m.retireMotif,
            }
          : null,
        signalementsOuverts: m.reports.filter((r) => r.traiteAt === null)
          .length,
      })),
    };
  }

  async supervisionReports() {
    const reports = await this.prisma.messageReport.findMany({
      where: { traiteAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        signaleParUser: { select: { nom: true, prenom: true } },
        message: {
          select: {
            id: true,
            auteur: true,
            createdAt: true,
            thread: {
              select: {
                id: true,
                guardian: { select: { nom: true, prenom: true } },
                student: { select: { nom: true, prenom: true } },
              },
            },
          },
        },
      },
    });
    const guardianIds = reports
      .map((r) => r.signaleParGuardianId)
      .filter((x): x is string => Boolean(x));
    const guardians = await this.prisma.guardian.findMany({
      where: { id: { in: guardianIds } },
      select: { id: true, nom: true, prenom: true },
    });
    // Repères seulement : le texte du message signalé s'ouvre depuis la conversation, ce qui est journalisé.
    return reports.map((r) => ({
      id: r.id,
      date: r.createdAt,
      signalePar:
        r.signaleParType === 'PARENT'
          ? `Responsable ${fullName(guardians.find((g) => g.id === r.signaleParGuardianId) ?? { prenom: '', nom: '' })}`.trim()
          : r.signaleParUser
            ? fullName(r.signaleParUser)
            : 'Personnel',
      motif: r.motif,
      messageId: r.message.id,
      messageDe: r.message.auteur,
      conversationId: r.message.thread.id,
      enfant: fullName(r.message.thread.student),
    }));
  }

  async resolveReport(actor: Actor, reportId: string) {
    const report = await this.prisma.messageReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.traiteAt)
      throw new ConflictException('Ce signalement est déjà traité.');
    await this.prisma.messageReport.update({
      where: { id: reportId },
      data: { traiteAt: new Date(), traiteParId: actor.id },
    });
    await this.log(
      actor.id,
      'MESSAGE_REPORT_RESOLVE',
      'MessageReport',
      reportId,
      { messageId: report.messageId },
    );
    return { ok: true };
  }

  /** Retrait modéré (D75) : le message n'est pas supprimé, il n'est plus lisible pour les participants. */
  async withdrawMessage(actor: Actor, messageId: string, motif: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message introuvable.');
    if (message.retireAt)
      throw new ConflictException('Ce message est déjà retiré.');
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        retireAt: new Date(),
        retireParId: actor.id,
        retireMotif: motif.trim(),
      },
    });
    await this.log(actor.id, 'MESSAGE_WITHDRAW', 'Message', messageId, {
      threadId: message.threadId,
      motif: motif.trim(),
    });
    return { ok: true };
  }

  // ==================================================================================== Annonces

  async createAnnouncement(
    actor: Actor,
    dto: { classId: string; titre: string; corps: string },
  ) {
    const klass = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true },
    });
    if (!klass) throw new NotFoundException('Classe introuvable.');
    await this.assertCanUseClass(actor, dto.classId);
    const titre = cleanText(dto.titre);
    const corps = cleanText(dto.corps);
    if (!titre || !corps)
      throw new BadRequestException('Le titre et le texte sont obligatoires.');
    const announcement = await this.prisma.announcement.create({
      data: { classId: dto.classId, auteurId: actor.id, titre, corps },
    });
    await this.log(
      actor.id,
      'ANNOUNCEMENT_CREATE',
      'Announcement',
      announcement.id,
      { classId: dto.classId },
    );
    await this.notifications.notifyAnnouncement(dto.classId, titre);
    return announcement;
  }

  /** Annonces vues par le personnel : celles des classes qu'il peut utiliser, retirées comprises (avec le motif). */
  async staffAnnouncements(actor: Actor, classId?: string) {
    const classes = await this.staffClasses(actor);
    const allowed = classes.map((c) => c.id);
    if (classId && !allowed.includes(classId))
      throw new ForbiddenException("Vous n'êtes pas affecté à cette classe.");
    const rows = await this.prisma.announcement.findMany({
      where: { classId: classId ?? { in: allowed } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        class: { select: { nom: true } },
        auteur: { select: { nom: true, prenom: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      classe: a.class.nom,
      classId: a.classId,
      titre: a.titre,
      corps: a.corps,
      auteur: fullName(a.auteur),
      date: a.createdAt,
      retire: a.retireAt ? { le: a.retireAt, motif: a.retireMotif } : null,
      peutRetirer: a.auteurId === actor.id || this.isSupervisor(actor),
    }));
  }

  async withdrawAnnouncement(actor: Actor, id: string, motif: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement) throw new NotFoundException('Annonce introuvable.');
    if (announcement.auteurId !== actor.id && !this.isSupervisor(actor)) {
      throw new ForbiddenException(
        "Seul l'auteur de l'annonce ou la Direction peut la retirer.",
      );
    }
    if (announcement.retireAt)
      throw new ConflictException('Cette annonce est déjà retirée.');
    await this.prisma.announcement.update({
      where: { id },
      data: {
        retireAt: new Date(),
        retireParId: actor.id,
        retireMotif: motif.trim(),
      },
    });
    await this.log(actor.id, 'ANNOUNCEMENT_WITHDRAW', 'Announcement', id, {
      motif: motif.trim(),
    });
    return { ok: true };
  }

  /** Annonces des classes actuelles des enfants d'un responsable (retirées exclues). */
  async parentAnnouncements(guardianId: string) {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, accesPortail: true },
      select: { student: { select: { id: true, prenom: true } } },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: { in: links.map((l) => l.student.id) },
        statut: 'ACTIVE',
      },
      select: { studentId: true, classId: true },
    });
    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    const rows = await this.prisma.announcement.findMany({
      where: { classId: { in: classIds }, retireAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        class: { select: { nom: true } },
        auteur: { select: { nom: true, prenom: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      classe: a.class.nom,
      titre: a.titre,
      corps: a.corps,
      auteur: fullName(a.auteur),
      date: a.createdAt,
      enfants: enrollments
        .filter((e) => e.classId === a.classId)
        .map(
          (e) =>
            links.find((l) => l.student.id === e.studentId)?.student.prenom,
        )
        .filter((p): p is string => Boolean(p)),
    }));
  }
}
