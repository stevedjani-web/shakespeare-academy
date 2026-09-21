import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { isoDay, normalize } from '../pedagogy/pedagogy.util';
import { dayInTimezone, justificationDeadline } from './attendance.util';
import {
  CreateJustificationDto,
  CreateReasonDto,
  DecideJustificationDto,
  UpdateReasonDto,
} from './dto/attendance.dto';

/** Justificatifs d'absence (D58) et liste des motifs saisie par la Direction. */
@Injectable()
export class JustificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(
    userId: string,
    action: string,
    entite: string,
    entiteId: string,
    ancienneValeur?: unknown,
    nouvelleValeur?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      ancienneValeur,
      nouvelleValeur,
    });
  }

  // ------------------------------------------------------------------------ Motifs

  listReasons() {
    return this.prisma.absenceReason.findMany({ orderBy: { libelle: 'asc' } });
  }

  private async assertReasonFree(libelle: string, excludeId?: string) {
    const all = await this.prisma.absenceReason.findMany();
    const clash = all.find((r) => r.id !== excludeId && normalize(r.libelle) === normalize(libelle));
    if (clash) {
      throw new ConflictException(`Le motif « ${clash.libelle} » existe déjà.`);
    }
  }

  async createReason(dto: CreateReasonDto, userId: string) {
    await this.assertReasonFree(dto.libelle);
    const reason = await this.prisma.absenceReason.create({ data: { libelle: dto.libelle.trim() } });
    await this.log(userId, 'ABSENCE_REASON_CREATE', 'AbsenceReason', reason.id, null, reason);
    return reason;
  }

  async updateReason(id: string, dto: UpdateReasonDto, userId: string) {
    const before = await this.prisma.absenceReason.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Motif introuvable.');
    }
    if (dto.libelle) await this.assertReasonFree(dto.libelle, id);
    const reason = await this.prisma.absenceReason.update({
      where: { id },
      data: { libelle: dto.libelle?.trim(), actif: dto.actif },
    });
    await this.log(userId, 'ABSENCE_REASON_UPDATE', 'AbsenceReason', id, before, reason);
    return reason;
  }

  async deleteReason(id: string, userId: string) {
    const before = await this.prisma.absenceReason.findUnique({
      where: { id },
      include: { _count: { select: { justifications: true } } },
    });
    if (!before) {
      throw new NotFoundException('Motif introuvable.');
    }
    if (before._count.justifications > 0) {
      throw new ConflictException('Ce motif sert dans des justificatifs : désactivez-le plutôt que de le supprimer.');
    }
    await this.prisma.absenceReason.delete({ where: { id } });
    await this.log(userId, 'ABSENCE_REASON_DELETE', 'AbsenceReason', id, before, null);
    return { id };
  }

  // ------------------------------------------------------------------ Justificatifs

  /**
   * Enregistre un justificatif pour une absence ou un retard (par la vie scolaire au nom du responsable
   * dans ce lot ; par le responsable lui-même via le portail au Lot 11). Passé le délai paramétré, il est
   * enregistré mais signalé « hors délai » : la décision revient à la vie scolaire.
   */
  async create(recordId: string, dto: CreateJustificationDto, userId: string) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: { call: true, justification: true },
    });
    if (!record) {
      throw new NotFoundException('Absence introuvable.');
    }
    if (record.statut === 'PRESENT') {
      throw new UnprocessableEntityException('Cet élève était présent : il n’y a rien à justifier.');
    }
    if (record.justification) {
      throw new ConflictException('Cette absence a déjà un justificatif.');
    }
    const commentaire = dto.commentaire?.trim() || undefined;
    if (!dto.reasonId && !commentaire) {
      throw new UnprocessableEntityException('Indiquez un motif ou un commentaire.');
    }
    if (dto.reasonId) {
      const reason = await this.prisma.absenceReason.findUnique({ where: { id: dto.reasonId } });
      if (!reason) throw new NotFoundException('Motif introuvable.');
      if (!reason.actif) throw new ConflictException('Ce motif est désactivé.');
    }

    const school = await this.prisma.school.findFirstOrThrow({
      select: { fuseauHoraire: true, delaiJustificatifJours: true, joursClasse: true },
    });
    const events = await this.prisma.calendarEvent.findMany({
      where: { dateFin: { gte: record.call.date } },
      select: { dateDebut: true, dateFin: true },
    });
    const deadline = justificationDeadline(
      isoDay(record.call.date),
      school.delaiJustificatifJours,
      school.joursClasse,
      events.map((e) => ({ debut: isoDay(e.dateDebut), fin: isoDay(e.dateFin) })),
    );
    const horsDelai = dayInTimezone(new Date(), school.fuseauHoraire) > deadline;

    const justification = await this.prisma.absenceJustification.create({
      data: {
        recordId,
        reasonId: dto.reasonId,
        commentaire,
        horsDelai,
        declaredById: userId,
      },
      include: { reason: true },
    });
    await this.log(userId, 'ATTENDANCE_JUSTIFICATION_CREATE', 'AbsenceJustification', justification.id, null, {
      recordId,
      motif: justification.reason?.libelle ?? null,
      horsDelai,
    });
    return justification;
  }

  async decide(id: string, dto: DecideJustificationDto, userId: string) {
    const before = await this.prisma.absenceJustification.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Justificatif introuvable.');
    }
    if (before.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Ce justificatif a déjà fait l’objet d’une décision.');
    }
    const decided = await this.prisma.absenceJustification.update({
      where: { id },
      data: {
        statut: dto.statut,
        decidedById: userId,
        decidedAt: new Date(),
        decisionCommentaire: dto.commentaire?.trim() || undefined,
      },
      include: { reason: true },
    });
    await this.log(userId, 'ATTENDANCE_JUSTIFICATION_DECIDE', 'AbsenceJustification', id, before.statut, {
      statut: decided.statut,
      commentaire: decided.decisionCommentaire,
    });
    return decided;
  }
}
