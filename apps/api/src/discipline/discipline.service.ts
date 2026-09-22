import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConvocationIssue,
  DisciplineGravite,
  DisciplineNature,
  DisciplineRecordStatus,
  SanctionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { cleanText, looksLikePhoneNumber } from '../messaging/messaging.util';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import type {
  CreateConvocationDto,
  CreateDisciplineTypeDto,
  CreateRecordDto,
  CreateSanctionTypeDto,
  DecideSanctionDto,
  ListConvocationsQueryDto,
  ListRecordsQueryDto,
  ListSanctionsQueryDto,
  UpdateCatalogueDto,
  UpdateRecordDto,
} from './dto/discipline.dto';

/** Inscription qui rattache un élève à une classe pour la discipline : active, dans l'année scolaire active. */
const CURRENT_ENROLLMENT = { statut: 'ACTIVE', academicYear: { statut: 'ACTIVE' } } as const;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const RECORD_INCLUDE = {
  student: { select: { id: true, nom: true, prenom: true, matricule: true } },
  class: { select: { id: true, nom: true } },
  type: { select: { id: true, nom: true, nature: true } },
  auteur: { select: { id: true, nom: true, prenom: true } },
  sanctions: {
    include: { type: { select: { id: true, nom: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.DisciplineRecordInclude;

type RecordRow = Prisma.DisciplineRecordGetPayload<{ include: typeof RECORD_INCLUDE }>;
type SanctionRow = RecordRow['sanctions'][number];

/**
 * Discipline (Lot 20) : incidents, sanctions, convocations et valorisations. Règles qui structurent tout :
 * - la description d'un incident et le message à la famille sont des données sensibles de mineurs : jamais dans le journal,
 *   jamais dans une notification, et le portail des parents ne les montre que selon une liste blanche (RV10, RV12) ;
 * - un enseignant ne signale que pour les élèves de ses classes et ne relit que ses propres signalements (la portée est
 *   appliquée ici, jamais seulement à l'écran) ;
 * - seule la Direction décide, publie et annule une sanction (droit réservé) ; le parent ne voit une sanction qu'une fois publiée.
 */
@Injectable()
export class DisciplineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ utilitaires

  private canReadAll(user: CurrentUserData): boolean {
    return user.permissions.includes('DISCIPLINE_READ') || user.permissions.includes('DISCIPLINE_DECIDE');
  }

  private async log(
    userId: string | null,
    action: string,
    entite: string,
    entiteId: string,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.schoolService.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      nouvelleValeur,
    });
  }

  private async today(): Promise<string> {
    const school = await this.prisma.school.findFirstOrThrow({ select: { fuseauHoraire: true } });
    return dayInTimezone(new Date(), school.fuseauHoraire);
  }

  /** Texte libre validé : nettoyé, et sans rien qui ressemble à un numéro de téléphone (RV09). */
  private async validText(raw: string, name: string, required = true): Promise<string> {
    const text = cleanText(raw ?? '');
    if (!text) {
      if (required) throw new BadRequestException(`${name} ne peut pas être vide.`);
      return '';
    }
    const school = await this.prisma.school.findFirstOrThrow({ select: { messageNumeroMinChiffres: true } });
    if (looksLikePhoneNumber(text, school.messageNumeroMinChiffres)) {
      throw new UnprocessableEntityException(
        `${name} contient ce qui ressemble à un numéro de téléphone : les numéros personnels ne figurent pas dans ce dossier.`,
      );
    }
    return text;
  }

  private async findStudent(studentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, nom: true, prenom: true, matricule: true, statut: true },
    });
    if (!student) throw new NotFoundException('Élève introuvable.');
    return student;
  }

  private currentEnrollment(studentId: string) {
    return this.prisma.enrollment.findFirst({
      where: { studentId, ...CURRENT_ENROLLMENT },
      orderBy: { dateInscription: 'desc' },
      select: { classId: true, academicYearId: true, class: { select: { id: true, nom: true } } },
    });
  }

  /** Fiche enseignant active du compte, ou null. */
  private teacherOf(userId: string) {
    return this.prisma.teacher.findUnique({ where: { userId } });
  }

  /** Un enseignant n'atteint qu'une classe où il a une affectation ; hors portée : 403 (jamais un simple masquage). */
  private async assertTeacherReach(user: CurrentUserData, classId: string) {
    const teacher = await this.teacherOf(user.id);
    const assignment =
      teacher && teacher.statut === 'ACTIF'
        ? await this.prisma.teachingAssignment.findFirst({
            where: { teacherId: teacher.id, classId },
            select: { id: true },
          })
        : null;
    if (!assignment) {
      throw new ForbiddenException('Vous ne pouvez signaler que pour les élèves de vos classes.');
    }
  }

  private async assertCanReport(user: CurrentUserData, classId: string) {
    if (this.canReadAll(user)) return;
    await this.assertTeacherReach(user, classId);
  }

  private async findType(typeId: string, nature: DisciplineNature) {
    const type = await this.prisma.disciplineType.findUnique({ where: { id: typeId } });
    if (!type || !type.actif) throw new BadRequestException('Type de signalement inconnu ou désactivé.');
    if (type.nature !== nature) {
      throw new BadRequestException('Ce type ne correspond pas à la nature du signalement.');
    }
    return type;
  }

  // ------------------------------------------------------------------ présentation

  private presentSanction(s: SanctionRow, full: boolean) {
    return {
      id: s.id,
      type: s.type.nom,
      statut: s.statut,
      dateDebut: isoDay(s.dateDebut),
      dateFin: s.dateFin ? isoDay(s.dateFin) : null,
      // Le message à la famille n'est montré qu'à la vie scolaire et à la Direction, jamais à l'enseignant qui a signalé.
      ...(full ? { messageFamille: s.messageFamille, publieLe: s.publieLe, motifAnnulation: s.motifAnnulation } : {}),
    };
  }

  private presentRecord(r: RecordRow, full: boolean) {
    return {
      id: r.id,
      nature: r.nature,
      type: { id: r.type.id, nom: r.type.nom },
      dateFaits: isoDay(r.dateFaits),
      gravite: r.gravite,
      description: r.description,
      statut: r.statut,
      classe: r.class.nom,
      eleve: r.student,
      auteur: full ? r.auteur : { id: r.auteur.id, nom: r.auteur.nom, prenom: r.auteur.prenom },
      motifClassement: full ? r.motifClassement : null,
      motifAnnulation: full ? r.motifAnnulation : null,
      createdAt: r.createdAt,
      // L'enseignant voit le nom et le statut d'une sanction publiée, jamais une sanction encore à l'étude.
      sanctions: (full ? r.sanctions : r.sanctions.filter((s) => s.statut === 'PUBLIEE')).map((s) =>
        this.presentSanction(s, full),
      ),
    };
  }

  // ------------------------------------------------------------------ signalements

  async createRecord(dto: CreateRecordDto, user: CurrentUserData) {
    const student = await this.findStudent(dto.studentId);
    const enrollment = await this.currentEnrollment(student.id);
    if (!enrollment) {
      throw new UnprocessableEntityException("Cet élève n'a pas d'inscription active dans l'année scolaire en cours.");
    }
    await this.assertCanReport(user, enrollment.classId);
    const type = await this.findType(dto.typeId, dto.nature);

    let gravite: DisciplineGravite | null = null;
    let description = '';
    if (dto.nature === 'INCIDENT') {
      if (!dto.gravite) throw new BadRequestException('Indiquez la gravité de l’incident.');
      gravite = dto.gravite;
      description = await this.validText(dto.description ?? '', 'La description');
      if (description.length < 3) throw new BadRequestException('Décrivez l’incident (3 caractères au moins).');
    } else if (dto.description) {
      description = await this.validText(dto.description, 'Le commentaire', false);
    }
    if (dto.dateFaits > (await this.today())) {
      throw new BadRequestException('La date des faits ne peut pas être dans le futur.');
    }

    const record = await this.prisma.disciplineRecord.create({
      data: {
        studentId: student.id,
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
        nature: dto.nature,
        typeId: type.id,
        dateFaits: new Date(dto.dateFaits),
        gravite,
        description,
        auteurUserId: user.id,
      },
      include: RECORD_INCLUDE,
    });
    await this.log(user.id, 'DISCIPLINE_RECORD_CREATE', 'DisciplineRecord', record.id, {
      nature: record.nature,
      typeId: record.typeId,
      gravite: record.gravite,
      studentId: record.studentId,
      classId: record.classId,
    });
    return this.presentRecord(record, this.canReadAll(user));
  }

  async updateRecord(id: string, dto: UpdateRecordDto, user: CurrentUserData) {
    const record = await this.prisma.disciplineRecord.findUnique({ where: { id }, include: RECORD_INCLUDE });
    if (!record) throw new NotFoundException('Signalement introuvable.');
    if (record.statut === 'ANNULE') throw new ConflictException('Ce signalement est annulé.');

    const canDecide = user.permissions.includes('DISCIPLINE_DECIDE');
    const today = await this.today();
    const school = await this.prisma.school.findFirstOrThrow({ select: { fuseauHoraire: true } });
    const ownAndSameDay =
      record.auteurUserId === user.id && dayInTimezone(record.createdAt, school.fuseauHoraire) === today;
    const hasActiveSanction = record.sanctions.some((s) => s.statut !== 'ANNULEE');

    // Verrouillage (RV04) : l'auteur corrige le jour même ; ensuite, seule la Direction, avec un motif.
    if (!ownAndSameDay) {
      if (!canDecide) throw new ForbiddenException('Ce signalement est verrouillé : seule la Direction peut le corriger.');
      if (!dto.motif || dto.motif.trim().length < 3) {
        throw new BadRequestException('Indiquez le motif de la correction (3 caractères au moins).');
      }
    } else if (hasActiveSanction && !canDecide) {
      throw new ConflictException('Une sanction est liée à ce signalement : seule la Direction peut le corriger.');
    }

    const data: Prisma.DisciplineRecordUpdateInput = {};
    const changed: string[] = [];
    if (dto.typeId && dto.typeId !== record.typeId) {
      const type = await this.findType(dto.typeId, record.nature);
      data.type = { connect: { id: type.id } };
      changed.push('type');
    }
    if (dto.dateFaits && dto.dateFaits !== isoDay(record.dateFaits)) {
      if (dto.dateFaits > today) throw new BadRequestException('La date des faits ne peut pas être dans le futur.');
      data.dateFaits = new Date(dto.dateFaits);
      changed.push('dateFaits');
    }
    if (dto.gravite !== undefined && record.nature === 'INCIDENT' && dto.gravite !== record.gravite) {
      data.gravite = dto.gravite;
      changed.push('gravite');
    }
    if (dto.description !== undefined) {
      const description = await this.validText(dto.description, 'La description', record.nature === 'INCIDENT');
      if (description !== record.description) {
        data.description = description;
        changed.push('description');
      }
    }
    if (changed.length === 0) return this.presentRecord(record, this.canReadAll(user));

    const [updated] = await this.prisma.$transaction([
      this.prisma.disciplineRecord.update({ where: { id }, data, include: RECORD_INCLUDE }),
      ...(ownAndSameDay
        ? []
        : [
            this.prisma.disciplineRecordRevision.create({
              data: {
                recordId: id,
                avant: {
                  typeId: record.typeId,
                  dateFaits: isoDay(record.dateFaits),
                  gravite: record.gravite,
                  description: record.description,
                },
                motif: dto.motif!.trim(),
                userId: user.id,
              },
            }),
          ]),
    ]);
    // Le journal ne contient que les champs modifiés et le motif, jamais la description.
    await this.log(user.id, 'DISCIPLINE_RECORD_UPDATE', 'DisciplineRecord', id, {
      champs: changed,
      motif: ownAndSameDay ? null : dto.motif!.trim(),
    });
    return this.presentRecord(updated, this.canReadAll(user));
  }

  async cancelRecord(id: string, motif: string, user: CurrentUserData) {
    const record = await this.prisma.disciplineRecord.findUnique({ where: { id }, include: { sanctions: true } });
    if (!record) throw new NotFoundException('Signalement introuvable.');
    if (record.statut === 'ANNULE') throw new ConflictException('Ce signalement est déjà annulé.');
    if (record.sanctions.some((s) => s.statut === 'PUBLIEE')) {
      throw new ConflictException('Une sanction publiée est liée à ce signalement : annulez-la d’abord.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      // Une sanction encore à l'étude tombe avec le signalement.
      this.prisma.sanction.updateMany({
        where: { recordId: id, statut: 'DECIDEE' },
        data: { statut: 'ANNULEE', annuleLe: now, motifAnnulation: motif.trim(), annuleParUserId: user.id },
      }),
      this.prisma.disciplineRecord.update({
        where: { id },
        data: { statut: 'ANNULE', motifAnnulation: motif.trim(), annuleParUserId: user.id },
      }),
    ]);
    await this.log(user.id, 'DISCIPLINE_RECORD_CANCEL', 'DisciplineRecord', id, { motif: motif.trim() });
    return { success: true };
  }

  /** Incident traité sans sanction (motif obligatoire). */
  async closeWithoutAction(id: string, motif: string, user: CurrentUserData) {
    const record = await this.prisma.disciplineRecord.findUnique({ where: { id }, include: { sanctions: true } });
    if (!record) throw new NotFoundException('Signalement introuvable.');
    if (record.nature !== 'INCIDENT') throw new BadRequestException('Seul un incident se classe sans suite.');
    if (record.statut !== 'OUVERT') throw new ConflictException('Ce signalement n’est plus ouvert.');
    if (record.sanctions.some((s) => s.statut !== 'ANNULEE')) {
      throw new ConflictException('Une sanction est liée à ce signalement.');
    }
    await this.prisma.disciplineRecord.update({
      where: { id },
      data: { statut: 'TRAITE', motifClassement: motif.trim() },
    });
    await this.log(user.id, 'DISCIPLINE_RECORD_CLOSE', 'DisciplineRecord', id, { motif: motif.trim() });
    return { success: true };
  }

  async listRecords(query: ListRecordsQueryDto, user: CurrentUserData) {
    const full = this.canReadAll(user);
    const where: Prisma.DisciplineRecordWhereInput = {
      // Un enseignant ne relit que ses propres signalements (portée serveur).
      ...(full ? {} : { auteurUserId: user.id }),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.nature ? { nature: query.nature } : {}),
      ...(query.statut ? { statut: query.statut as DisciplineRecordStatus } : {}),
      ...(query.from || query.to
        ? {
            dateFaits: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    if (!full) {
      const teacher = await this.teacherOf(user.id);
      if (!teacher) {
        throw new ForbiddenException("Votre compte n'est relié à aucune fiche enseignant : contactez l'administration.");
      }
    }
    const rows = await this.prisma.disciplineRecord.findMany({
      where,
      include: RECORD_INCLUDE,
      orderBy: [{ dateFaits: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((r) => this.presentRecord(r, full));
  }

  // ------------------------------------------------------------------ sanctions

  async decideSanction(recordId: string, dto: DecideSanctionDto, user: CurrentUserData) {
    const record = await this.prisma.disciplineRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Signalement introuvable.');
    if (record.nature !== 'INCIDENT') throw new BadRequestException('Une sanction ne concerne qu’un incident.');
    if (record.statut === 'ANNULE') throw new ConflictException('Ce signalement est annulé.');
    if (record.motifClassement) throw new ConflictException('Cet incident a été classé sans suite.');
    const type = await this.prisma.sanctionType.findUnique({ where: { id: dto.typeId } });
    if (!type || !type.actif) throw new BadRequestException('Type de sanction inconnu ou désactivé.');
    if (dto.dateFin && dto.dateFin < dto.dateDebut) {
      throw new BadRequestException('La date de fin ne peut pas précéder la date de début.');
    }
    const message = dto.messageFamille
      ? await this.validText(dto.messageFamille, 'Le message à la famille', false)
      : '';

    const [sanction] = await this.prisma.$transaction([
      this.prisma.sanction.create({
        data: {
          recordId,
          studentId: record.studentId,
          typeId: type.id,
          dateDebut: new Date(dto.dateDebut),
          dateFin: dto.dateFin ? new Date(dto.dateFin) : null,
          messageFamille: message || null,
          decideParUserId: user.id,
        },
        include: { type: { select: { id: true, nom: true } } },
      }),
      this.prisma.disciplineRecord.update({ where: { id: recordId }, data: { statut: 'TRAITE' } }),
    ]);
    // Journal : identifiants, type et dates, jamais le message à la famille.
    await this.log(user.id, 'DISCIPLINE_SANCTION_DECIDE', 'Sanction', sanction.id, {
      recordId,
      typeId: type.id,
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin ?? null,
    });
    return this.presentSanction(sanction as SanctionRow, true);
  }

  async publishSanction(id: string, user: CurrentUserData) {
    const sanction = await this.prisma.sanction.findUnique({ where: { id }, include: { record: true } });
    if (!sanction) throw new NotFoundException('Sanction introuvable.');
    if (sanction.statut !== 'DECIDEE') throw new ConflictException('Cette sanction est déjà publiée ou annulée.');
    if (sanction.record.statut === 'ANNULE') throw new ConflictException('Le signalement est annulé.');
    await this.prisma.sanction.update({
      where: { id },
      data: { statut: 'PUBLIEE', publieLe: new Date(), publieParUserId: user.id },
    });
    await this.log(user.id, 'DISCIPLINE_SANCTION_PUBLISH', 'Sanction', id, { recordId: sanction.recordId });
    // Alerte générique, jamais le détail (RV10). Ne lève jamais.
    await this.notifications.notifyDiscipline(sanction.studentId);
    return { success: true };
  }

  async cancelSanction(id: string, motif: string, user: CurrentUserData) {
    const sanction = await this.prisma.sanction.findUnique({ where: { id }, include: { record: true } });
    if (!sanction) throw new NotFoundException('Sanction introuvable.');
    if (sanction.statut === 'ANNULEE') throw new ConflictException('Cette sanction est déjà annulée.');
    await this.prisma.$transaction(async (tx) => {
      await tx.sanction.update({
        where: { id },
        data: { statut: 'ANNULEE', annuleLe: new Date(), motifAnnulation: motif.trim(), annuleParUserId: user.id },
      });
      // Plus aucune sanction en cours : l'incident redevient ouvert (sauf s'il a été classé sans suite).
      const remaining = await tx.sanction.count({
        where: { recordId: sanction.recordId, statut: { in: ['DECIDEE', 'PUBLIEE'] } },
      });
      if (remaining === 0 && sanction.record.statut === 'TRAITE' && !sanction.record.motifClassement) {
        await tx.disciplineRecord.update({ where: { id: sanction.recordId }, data: { statut: 'OUVERT' } });
      }
    });
    await this.log(user.id, 'DISCIPLINE_SANCTION_CANCEL', 'Sanction', id, {
      recordId: sanction.recordId,
      motif: motif.trim(),
      etaitPubliee: sanction.statut === 'PUBLIEE',
    });
    return { success: true };
  }

  /** Sanctions à traiter par la Direction (décidées, pas encore publiées, ou toutes selon le filtre). */
  async listSanctions(query: ListSanctionsQueryDto) {
    const rows = await this.prisma.sanction.findMany({
      where: { ...(query.statut ? { statut: query.statut } : {}), record: { statut: { not: 'ANNULE' } } },
      include: {
        type: { select: { id: true, nom: true } },
        student: { select: { id: true, nom: true, prenom: true, matricule: true } },
        record: { select: { id: true, dateFaits: true, class: { select: { nom: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((s) => ({
      id: s.id,
      recordId: s.recordId,
      type: s.type.nom,
      statut: s.statut,
      dateDebut: isoDay(s.dateDebut),
      dateFin: s.dateFin ? isoDay(s.dateFin) : null,
      messageFamille: s.messageFamille,
      publieLe: s.publieLe,
      eleve: s.student,
      classe: s.record.class.nom,
      dateFaits: isoDay(s.record.dateFaits),
    }));
  }

  // ------------------------------------------------------------------ convocations

  async createConvocation(dto: CreateConvocationDto, user: CurrentUserData) {
    const student = await this.findStudent(dto.studentId);
    if (student.statut !== 'ACTIF') throw new UnprocessableEntityException('Le dossier de cet élève est inactif.');
    const rdv = new Date(dto.dateRdv);
    if (rdv.getTime() <= Date.now()) {
      throw new BadRequestException('Le rendez-vous doit être fixé à une date et une heure à venir.');
    }
    if (dto.recordId) {
      const record = await this.prisma.disciplineRecord.findUnique({ where: { id: dto.recordId } });
      if (!record || record.studentId !== student.id) {
        throw new BadRequestException('Ce signalement ne concerne pas cet élève.');
      }
    }
    const lieu = await this.validText(dto.lieu, 'Le lieu');
    const objet = await this.validText(dto.objet, 'L’objet');
    const convocation = await this.prisma.disciplineConvocation.create({
      data: {
        studentId: student.id,
        recordId: dto.recordId ?? null,
        dateRdv: rdv,
        lieu,
        objet,
        creeParUserId: user.id,
      },
    });
    await this.log(user.id, 'DISCIPLINE_CONVOCATION_CREATE', 'DisciplineConvocation', convocation.id, {
      studentId: student.id,
      recordId: dto.recordId ?? null,
      dateRdv: rdv.toISOString(),
    });
    await this.notifications.notifyDiscipline(student.id);
    return this.presentConvocation(convocation, student);
  }

  private presentConvocation(
    c: Prisma.DisciplineConvocationGetPayload<object>,
    student?: { id: string; nom: string; prenom: string; matricule: string },
  ) {
    return {
      id: c.id,
      eleve: student ?? null,
      recordId: c.recordId,
      dateRdv: c.dateRdv.toISOString(),
      lieu: c.lieu,
      objet: c.objet,
      statut: c.statut,
      accuseLe: c.accuseLe,
      issue: c.issue,
      motifAnnulation: c.motifAnnulation,
      createdAt: c.createdAt,
    };
  }

  async listConvocations(query: ListConvocationsQueryDto) {
    const rows = await this.prisma.disciplineConvocation.findMany({
      where: {
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.statut ? { statut: query.statut } : {}),
      },
      include: { student: { select: { id: true, nom: true, prenom: true, matricule: true } } },
      orderBy: { dateRdv: 'desc' },
      take: 200,
    });
    return rows.map((c) => this.presentConvocation(c, c.student));
  }

  async cancelConvocation(id: string, motif: string, user: CurrentUserData) {
    const c = await this.prisma.disciplineConvocation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Convocation introuvable.');
    if (c.statut !== 'ENVOYEE') throw new ConflictException('Cette convocation est déjà annulée.');
    await this.prisma.disciplineConvocation.update({
      where: { id },
      data: { statut: 'ANNULEE', annuleLe: new Date(), motifAnnulation: motif.trim() },
    });
    await this.log(user.id, 'DISCIPLINE_CONVOCATION_CANCEL', 'DisciplineConvocation', id, { motif: motif.trim() });
    return { success: true };
  }

  async setConvocationIssue(id: string, issue: ConvocationIssue, user: CurrentUserData) {
    const c = await this.prisma.disciplineConvocation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Convocation introuvable.');
    if (c.statut !== 'ENVOYEE') throw new ConflictException('Cette convocation est annulée.');
    if (c.issue) throw new ConflictException('L’issue de cette convocation est déjà enregistrée.');
    await this.prisma.disciplineConvocation.update({ where: { id }, data: { issue, issueLe: new Date() } });
    await this.log(user.id, 'DISCIPLINE_CONVOCATION_OUTCOME', 'DisciplineConvocation', id, { issue });
    return { success: true };
  }

  // ------------------------------------------------------------------ dossier d'un élève et sélecteurs

  /** Dossier complet d'un élève. Chaque ouverture est journalisée (RV11), sans le contenu. */
  async studentHistory(studentId: string, user: CurrentUserData) {
    const student = await this.findStudent(studentId);
    const [records, convocations] = await Promise.all([
      this.prisma.disciplineRecord.findMany({
        where: { studentId },
        include: RECORD_INCLUDE,
        orderBy: [{ dateFaits: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.disciplineConvocation.findMany({ where: { studentId }, orderBy: { dateRdv: 'desc' } }),
    ]);
    await this.log(user.id, 'DISCIPLINE_STUDENT_READ', 'Student', studentId, {
      signalements: records.length,
      convocations: convocations.length,
    });
    return {
      eleve: student,
      signalements: records.map((r) => this.presentRecord(r, true)),
      convocations: convocations.map((c) => this.presentConvocation(c)),
    };
  }

  /** Classes de l'année active que l'utilisateur peut signaler : toutes pour la vie scolaire, les siennes pour un enseignant. */
  async myClasses(user: CurrentUserData) {
    const activeYear = await this.prisma.academicYear.findFirst({ where: { statut: 'ACTIVE' }, select: { id: true } });
    if (!activeYear) return [];
    if (this.canReadAll(user)) {
      return this.prisma.class.findMany({
        where: { academicYearId: activeYear.id },
        select: { id: true, nom: true },
        orderBy: { nom: 'asc' },
      });
    }
    const teacher = await this.teacherOf(user.id);
    if (!teacher || teacher.statut !== 'ACTIF') return [];
    return this.prisma.class.findMany({
      where: { academicYearId: activeYear.id, assignments: { some: { teacherId: teacher.id } } },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
  }

  async classStudents(classId: string, user: CurrentUserData) {
    await this.assertCanReport(user, classId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, statut: 'ACTIVE', academicYear: { statut: 'ACTIVE' }, student: { statut: 'ACTIF' } },
      select: { student: { select: { id: true, nom: true, prenom: true, matricule: true } } },
      orderBy: { student: { nom: 'asc' } },
    });
    return enrollments.map((e) => e.student);
  }

  // ------------------------------------------------------------------ catalogues

  private async conflictAware<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ce nom existe déjà.');
      }
      throw err;
    }
  }

  listTypes(nature?: DisciplineNature) {
    return this.prisma.disciplineType.findMany({
      where: nature ? { nature } : {},
      orderBy: [{ nature: 'asc' }, { nom: 'asc' }],
    });
  }

  async createType(dto: CreateDisciplineTypeDto, user: CurrentUserData) {
    const type = await this.conflictAware(() =>
      this.prisma.disciplineType.create({ data: { nature: dto.nature, nom: dto.nom.trim() } }),
    );
    await this.log(user.id, 'DISCIPLINE_TYPE_CREATE', 'DisciplineType', type.id, { nature: type.nature, nom: type.nom });
    return type;
  }

  async updateType(id: string, dto: UpdateCatalogueDto, user: CurrentUserData) {
    const existing = await this.prisma.disciplineType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Type introuvable.');
    const type = await this.conflictAware(() =>
      this.prisma.disciplineType.update({
        where: { id },
        data: { ...(dto.nom ? { nom: dto.nom.trim() } : {}), ...(dto.actif !== undefined ? { actif: dto.actif } : {}) },
      }),
    );
    await this.log(user.id, 'DISCIPLINE_TYPE_UPDATE', 'DisciplineType', id, { nom: type.nom, actif: type.actif });
    return type;
  }

  listSanctionTypes() {
    return this.prisma.sanctionType.findMany({ orderBy: { nom: 'asc' } });
  }

  async createSanctionType(dto: CreateSanctionTypeDto, user: CurrentUserData) {
    const type = await this.conflictAware(() => this.prisma.sanctionType.create({ data: { nom: dto.nom.trim() } }));
    await this.log(user.id, 'SANCTION_TYPE_CREATE', 'SanctionType', type.id, { nom: type.nom });
    return type;
  }

  async updateSanctionType(id: string, dto: UpdateCatalogueDto, user: CurrentUserData) {
    const existing = await this.prisma.sanctionType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Type de sanction introuvable.');
    const type = await this.conflictAware(() =>
      this.prisma.sanctionType.update({
        where: { id },
        data: { ...(dto.nom ? { nom: dto.nom.trim() } : {}), ...(dto.actif !== undefined ? { actif: dto.actif } : {}) },
      }),
    );
    await this.log(user.id, 'SANCTION_TYPE_UPDATE', 'SanctionType', id, { nom: type.nom, actif: type.actif });
    return type;
  }

  // ------------------------------------------------------------------ portail des parents

  /**
   * Ce que voit un responsable pour son enfant : une LISTE BLANCHE. Jamais la description, l'auteur, la gravité,
   * l'incident à l'origine ni un autre élève. Une sanction n'apparaît qu'une fois publiée (ou retirée après publication).
   */
  async portalView(studentId: string) {
    const [sanctions, convocations, valorisations] = await Promise.all([
      this.prisma.sanction.findMany({
        where: { studentId, publieLe: { not: null }, statut: { in: ['PUBLIEE', 'ANNULEE'] } },
        include: { type: { select: { nom: true } } },
        orderBy: { publieLe: 'desc' },
        take: 100,
      }),
      this.prisma.disciplineConvocation.findMany({ where: { studentId }, orderBy: { dateRdv: 'desc' }, take: 100 }),
      this.prisma.disciplineRecord.findMany({
        where: { studentId, nature: 'VALORISATION', statut: { not: 'ANNULE' } },
        include: { type: { select: { nom: true } } },
        orderBy: { dateFaits: 'desc' },
        take: 100,
      }),
    ]);
    return {
      sanctions: sanctions.map((s) => ({
        id: s.id,
        type: s.type.nom,
        dateDebut: isoDay(s.dateDebut),
        dateFin: s.dateFin ? isoDay(s.dateFin) : null,
        message: s.messageFamille,
        retiree: s.statut === 'ANNULEE',
      })),
      convocations: convocations.map((c) => ({
        id: c.id,
        dateRdv: c.dateRdv.toISOString(),
        lieu: c.lieu,
        objet: c.objet,
        annulee: c.statut === 'ANNULEE',
        accuseLe: c.accuseLe,
        issue: c.issue,
      })),
      valorisations: valorisations.map((v) => ({ id: v.id, type: v.type.nom, date: isoDay(v.dateFaits) })),
    };
  }

  /** Accusé de réception d'une convocation par un responsable de l'élève (idempotent). */
  async acknowledgeConvocation(guardianId: string, studentId: string, convocationId: string) {
    const c = await this.prisma.disciplineConvocation.findFirst({ where: { id: convocationId, studentId } });
    if (!c) throw new NotFoundException('Convocation introuvable.');
    if (c.statut !== 'ENVOYEE') throw new ConflictException('Cette convocation a été annulée.');
    if (c.accuseLe) return { accuseLe: c.accuseLe };
    const updated = await this.prisma.disciplineConvocation.update({
      where: { id: c.id },
      data: { accuseLe: new Date(), accuseParGuardianId: guardianId },
    });
    await this.log(null, 'DISCIPLINE_CONVOCATION_ACK', 'DisciplineConvocation', c.id, { guardianId });
    return { accuseLe: updated.accuseLe };
  }
}
