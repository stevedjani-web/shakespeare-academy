import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PreRegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NumberSequenceService } from '../common/number-sequence.service';
import { normalizeText } from '../common/normalize-text.util';
import { StudentsService } from '../students/students.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { ClassesService } from '../classes/classes.service';
import type {
  AcceptPreRegistrationDto,
  CreatePreRegistrationDto,
} from './dto/pre-registration.dto';

const REFERENCE_DIGITS = 6;

/**
 * Préinscription en ligne (Lot 21) : une famille dépose une demande sans compte ni élève existant. Le secrétariat
 * l'examine puis, en l'acceptant, choisit la classe réelle et déclenche la création de l'élève et de son inscription
 * en réutilisant tels quels StudentsService (doublon D33, matricule) et EnrollmentsService (numéro, facture, RG01).
 * Aucun frais de dossier (D04 non tranchée) : ce n'est qu'une demande, jamais un engagement financier.
 */
@Injectable()
export class PreRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
    private readonly numberSequenceService: NumberSequenceService,
    private readonly studentsService: StudentsService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly classesService: ClassesService,
  ) {}

  /** Arbre public Section → Cycle → Level, en lecture seule (jamais un effectif ni un tarif). */
  async publicLevelTree() {
    const sections = await this.prisma.section.findMany({
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        nom: true,
        cycles: {
          orderBy: { nom: 'asc' },
          select: {
            id: true,
            nom: true,
            levels: { orderBy: { ordre: 'asc' }, select: { id: true, nom: true } },
          },
        },
      },
    });
    return sections.map((s) => ({
      sectionId: s.id,
      sectionNom: s.nom,
      cycles: s.cycles.map((c) => ({
        cycleId: c.id,
        cycleNom: c.nom,
        levels: c.levels.map((l) => ({ id: l.id, nom: l.nom })),
      })),
    }));
  }

  async create(dto: CreatePreRegistrationDto) {
    const schoolId = await this.schoolService.getDefaultId();
    // Level n'a pas de schoolId direct (il descend de Cycle → Section) : on vérifie via une jointure explicite.
    const validLevel = await this.prisma.level.findFirst({
      where: { id: dto.levelId, cycle: { section: { schoolId } } },
      select: { id: true },
    });
    if (!validLevel) throw new BadRequestException('Niveau inconnu.');

    const dateNaissance = new Date(dto.dateNaissance);
    if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
      throw new BadRequestException('Date de naissance invalide.');
    }

    // Une même demande, encore en attente, ne se dépose pas deux fois : une réponse déjà donnée (acceptée ou
    // refusée) n'empêche jamais une nouvelle demande (une famille refusée peut retenter, une acceptée n'a plus lieu).
    const pending = await this.prisma.preRegistration.findMany({
      where: { schoolId, statut: 'EN_ATTENTE', dateNaissance },
      select: { id: true, nom: true, prenom: true },
    });
    const nom = normalizeText(dto.nom);
    const prenom = normalizeText(dto.prenom);
    if (pending.some((p) => normalizeText(p.nom) === nom && normalizeText(p.prenom) === prenom)) {
      throw new ConflictException('Une demande est déjà en attente pour cet enfant : inutile de la redéposer.');
    }

    const year = new Date().getFullYear();
    const sequence = await this.numberSequenceService.next(schoolId, 'PREINSCRIPTION', String(year));
    const reference = `PREINS-${year}-${String(sequence).padStart(REFERENCE_DIGITS, '0')}`;

    const created = await this.prisma.preRegistration.create({
      data: {
        schoolId,
        reference,
        nom: dto.nom.trim(),
        prenom: dto.prenom.trim(),
        sexe: dto.sexe,
        dateNaissance,
        lieuNaissance: dto.lieuNaissance?.trim() || null,
        nationalite: dto.nationalite?.trim() || null,
        levelId: dto.levelId,
        responsableNom: dto.responsableNom.trim(),
        responsablePrenom: dto.responsablePrenom.trim(),
        responsableTelephone: dto.responsableTelephone.trim(),
        responsableEmail: dto.responsableEmail?.trim() || null,
        message: dto.message?.trim() || null,
      },
    });
    await this.audit.log({
      schoolId,
      userId: null,
      action: 'PREREGISTRATION_CREATE',
      entite: 'PreRegistration',
      entiteId: created.id,
      nouvelleValeur: { reference: created.reference, levelId: created.levelId },
    });
    return { reference: created.reference };
  }

  /** Suivi public : la référence seule ne suffit pas (séquentielle, devinable) ; le téléphone doit correspondre. */
  async track(reference: string, telephone: string) {
    const row = await this.prisma.preRegistration.findUnique({ where: { reference: reference.trim() } });
    if (!row || row.responsableTelephone !== telephone.trim()) {
      throw new NotFoundException('Aucune demande ne correspond à cette référence et ce téléphone.');
    }
    return {
      reference: row.reference,
      enfant: `${row.prenom} ${row.nom}`,
      statut: row.statut,
      motifRejet: row.statut === 'REJETEE' ? row.motifRejet : null,
      dateDepot: row.createdAt,
      dateTraitement: row.traiteLe,
    };
  }

  private async findOrThrow(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const row = await this.prisma.preRegistration.findFirst({ where: { id, schoolId } });
    if (!row) throw new NotFoundException('Préinscription introuvable.');
    return row;
  }

  async list(statut?: PreRegistrationStatus) {
    const schoolId = await this.schoolService.getDefaultId();
    const rows = await this.prisma.preRegistration.findMany({
      where: { schoolId, ...(statut ? { statut } : {}) },
      include: { level: { select: { id: true, nom: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((r) => this.present(r));
  }

  async findOne(id: string) {
    const row = await this.findOrThrow(id);
    const level = await this.prisma.level.findUnique({ where: { id: row.levelId }, select: { id: true, nom: true } });
    return this.present({ ...row, level });
  }

  private present(row: {
    id: string; reference: string; nom: string; prenom: string; sexe: string; dateNaissance: Date;
    lieuNaissance: string | null; nationalite: string | null; level: { id: string; nom: string } | null;
    responsableNom: string; responsablePrenom: string; responsableTelephone: string; responsableEmail: string | null;
    message: string | null; statut: string; motifRejet: string | null; studentId: string | null;
    enrollmentId: string | null; createdAt: Date; traiteLe: Date | null;
  }) {
    return {
      id: row.id,
      reference: row.reference,
      eleve: {
        nom: row.nom,
        prenom: row.prenom,
        sexe: row.sexe,
        dateNaissance: row.dateNaissance.toISOString().slice(0, 10),
        lieuNaissance: row.lieuNaissance,
        nationalite: row.nationalite,
      },
      niveau: row.level,
      responsable: {
        nom: row.responsableNom,
        prenom: row.responsablePrenom,
        telephone: row.responsableTelephone,
        email: row.responsableEmail,
      },
      message: row.message,
      statut: row.statut,
      motifRejet: row.motifRejet,
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      createdAt: row.createdAt,
      traiteLe: row.traiteLe,
    };
  }

  /**
   * Accepter convertit la demande en élève et inscription réels, en réutilisant les services existants (D33, RG01,
   * facture) sans les dupliquer. Si l'inscription échoue après la création de l'élève, celui-ci reste utilisable
   * (comme le fait déjà l'assistant d'inscription du dashboard, deux appels non atomiques) : le secrétariat termine
   * alors l'inscription manuellement depuis le dossier de l'élève.
   */
  async accept(id: string, dto: AcceptPreRegistrationDto, actingUserId: string) {
    const row = await this.findOrThrow(id);
    if (row.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cette demande a déjà été traitée.');
    }
    const klass = await this.classesService.findOne(dto.classId);

    const student = await this.studentsService.create(
      {
        nom: row.nom,
        prenom: row.prenom,
        sexe: row.sexe,
        dateNaissance: row.dateNaissance.toISOString().slice(0, 10),
        lieuNaissance: row.lieuNaissance ?? undefined,
        nationalite: row.nationalite ?? undefined,
        responsable: {
          nom: row.responsableNom,
          prenom: row.responsablePrenom,
          telephone: row.responsableTelephone,
          email: row.responsableEmail ?? undefined,
          lien: 'Parent',
        },
        forcerCreation: dto.forcerCreation,
      },
      actingUserId,
    );

    const enrollment = await this.enrollmentsService.create(
      { studentId: student.id, classId: klass.id, academicYearId: klass.academicYearId },
      actingUserId,
    );

    const updated = await this.prisma.preRegistration.update({
      where: { id: row.id },
      data: {
        statut: 'ACCEPTEE',
        studentId: student.id,
        enrollmentId: enrollment.id,
        traiteParUserId: actingUserId,
        traiteLe: new Date(),
      },
    });
    await this.audit.log({
      schoolId: row.schoolId,
      userId: actingUserId,
      action: 'PREREGISTRATION_ACCEPT',
      entite: 'PreRegistration',
      entiteId: row.id,
      nouvelleValeur: { studentId: student.id, enrollmentId: enrollment.id },
    });
    return this.findOne(updated.id);
  }

  async reject(id: string, motif: string, actingUserId: string) {
    const row = await this.findOrThrow(id);
    if (row.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cette demande a déjà été traitée.');
    }
    await this.prisma.preRegistration.update({
      where: { id: row.id },
      data: { statut: 'REJETEE', motifRejet: motif.trim(), traiteParUserId: actingUserId, traiteLe: new Date() },
    });
    await this.audit.log({
      schoolId: row.schoolId,
      userId: actingUserId,
      action: 'PREREGISTRATION_REJECT',
      entite: 'PreRegistration',
      entiteId: row.id,
      nouvelleValeur: { motif: motif.trim() },
    });
    return this.findOne(row.id);
  }
}
