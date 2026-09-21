import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { SetPilotDto, UpdatePedagogySettingsDto } from './dto/pedagogy.dto';

/** Paramètres pédagogiques, classe pilote et récapitulatif de ce qui reste à saisir. */
@Injectable()
export class PedagogyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  async getSettings() {
    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        joursClasse: true,
        retardMaxMinutes: true,
        delaiJustificatifJours: true,
        pointageFenetreMinutes: true,
        pointageToleranceMinutes: true,
        pointageEcartMinMinutes: true,
      },
    });
    return school;
  }

  async updateSettings(dto: UpdatePedagogySettingsDto, userId: string) {
    const before = await this.getSettings();
    const school = await this.prisma.school.update({
      where: { id: await this.school.getDefaultId() },
      data: {
        joursClasse: dto.joursClasse ? [...dto.joursClasse].sort((a, b) => a - b) : undefined,
        retardMaxMinutes: dto.retardMaxMinutes,
        delaiJustificatifJours: dto.delaiJustificatifJours,
        pointageFenetreMinutes: dto.pointageFenetreMinutes,
        pointageToleranceMinutes: dto.pointageToleranceMinutes,
        pointageEcartMinMinutes: dto.pointageEcartMinMinutes,
      },
      select: {
        id: true,
        joursClasse: true,
        retardMaxMinutes: true,
        delaiJustificatifJours: true,
        pointageFenetreMinutes: true,
        pointageToleranceMinutes: true,
        pointageEcartMinMinutes: true,
      },
    });
    await this.audit.log({
      schoolId: school.id,
      userId,
      action: 'PEDAGOGY_SETTINGS_UPDATE',
      entite: 'School',
      entiteId: school.id,
      ancienneValeur: before,
      nouvelleValeur: {
        joursClasse: school.joursClasse,
        retardMaxMinutes: school.retardMaxMinutes,
        delaiJustificatifJours: school.delaiJustificatifJours,
        pointageFenetreMinutes: school.pointageFenetreMinutes,
        pointageToleranceMinutes: school.pointageToleranceMinutes,
        pointageEcartMinMinutes: school.pointageEcartMinMinutes,
      },
    });
    return {
      joursClasse: school.joursClasse,
      retardMaxMinutes: school.retardMaxMinutes,
      delaiJustificatifJours: school.delaiJustificatifJours,
      pointageFenetreMinutes: school.pointageFenetreMinutes,
      pointageToleranceMinutes: school.pointageToleranceMinutes,
      pointageEcartMinMinutes: school.pointageEcartMinMinutes,
    };
  }

  /**
   * Désigne la classe pilote et/ou l'enseignant volontaire. Une seule de chaque à la fois : en
   * désigner une retire la précédente. `null` retire la désignation, une clé absente ne change rien.
   */
  async setPilot(dto: SetPilotDto, userId: string) {
    const schoolId = await this.school.getDefaultId();
    const before = await this.getPilot();

    if (dto.classId) {
      const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
      if (!klass) {
        throw new NotFoundException('Classe introuvable.');
      }
    }
    if (dto.teacherId) {
      const teacher = await this.prisma.teacher.findUnique({ where: { id: dto.teacherId } });
      if (!teacher) {
        throw new NotFoundException('Enseignant introuvable.');
      }
      if (teacher.statut !== 'ACTIF') {
        throw new ConflictException('Cet enseignant est inactif.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.classId !== undefined) {
        await tx.class.updateMany({ where: { pilote: true }, data: { pilote: false } });
        if (dto.classId) {
          await tx.class.update({ where: { id: dto.classId }, data: { pilote: true } });
        }
      }
      if (dto.teacherId !== undefined) {
        await tx.teacher.updateMany({
          where: { volontairePilote: true },
          data: { volontairePilote: false },
        });
        if (dto.teacherId) {
          await tx.teacher.update({
            where: { id: dto.teacherId },
            data: { volontairePilote: true },
          });
        }
      }
    });

    const after = await this.getPilot();
    await this.audit.log({
      schoolId,
      userId,
      action: 'PILOT_UPDATE',
      entite: 'School',
      entiteId: schoolId,
      ancienneValeur: before,
      nouvelleValeur: after,
    });
    return after;
  }

  async getPilot() {
    const [classe, enseignant] = await Promise.all([
      this.prisma.class.findFirst({
        where: { pilote: true },
        select: { id: true, nom: true, academicYearId: true },
      }),
      this.prisma.teacher.findFirst({
        where: { volontairePilote: true },
        select: { id: true, nom: true, prenom: true },
      }),
    ]);
    return { classe, enseignant };
  }

  /** Tableau de suivi de la saisie : ce qui est rempli, ce qui manque encore. */
  async summary(academicYearId?: string) {
    const year = academicYearId
      ? await this.prisma.academicYear.findUnique({ where: { id: academicYearId } })
      : await this.prisma.academicYear.findFirst({ where: { statut: 'ACTIVE' } });
    if (academicYearId && !year) {
      throw new NotFoundException('Année scolaire introuvable.');
    }

    const [settings, slots, subjects, teachers, rooms, pilot] = await Promise.all([
      this.getSettings(),
      this.prisma.timeSlot.findMany({ select: { sectionId: true, type: true } }),
      this.prisma.subject.findMany({
        where: { actif: true },
        select: { id: true, _count: { select: { levels: true } } },
      }),
      this.prisma.teacher.findMany({
        select: { id: true, statut: true, _count: { select: { assignments: true } } },
      }),
      this.prisma.room.count({ where: { actif: true } }),
      this.getPilot(),
    ]);

    const yearId = year?.id;
    const [terms, events, classes, subjectLevels, assignments] = yearId
      ? await Promise.all([
          this.prisma.term.count({ where: { academicYearId: yearId } }),
          this.prisma.calendarEvent.groupBy({
            by: ['type'],
            where: { academicYearId: yearId },
            _count: true,
          }),
          this.prisma.class.findMany({
            where: { academicYearId: yearId },
            select: { id: true, levelId: true },
          }),
          this.prisma.subjectLevel.findMany({
            where: { subject: { actif: true } },
            select: { levelId: true, subjectId: true },
          }),
          this.prisma.teachingAssignment.findMany({
            where: { class: { academicYearId: yearId } },
            select: { classId: true, subjectId: true },
          }),
        ])
      : [0, [], [], [], []];

    const eventCount = (type: string) =>
      (events as Array<{ type: string; _count: number }>).find((e) => e.type === type)?._count ?? 0;

    // Matières attendues par classe (celles de son niveau) moins celles déjà affectées.
    const subjectsByLevel = new Map<string, Set<string>>();
    for (const ls of subjectLevels as Array<{ levelId: string; subjectId: string }>) {
      const set = subjectsByLevel.get(ls.levelId) ?? new Set<string>();
      set.add(ls.subjectId);
      subjectsByLevel.set(ls.levelId, set);
    }
    const assigned = new Set(
      (assignments as Array<{ classId: string; subjectId: string }>).map(
        (a) => `${a.classId}|${a.subjectId}`,
      ),
    );
    let manquantes = 0;
    let requises = 0;
    let classesCompletes = 0;
    for (const c of classes as Array<{ id: string; levelId: string }>) {
      const required = subjectsByLevel.get(c.levelId) ?? new Set<string>();
      const missing = [...required].filter((s) => !assigned.has(`${c.id}|${s}`)).length;
      manquantes += missing;
      requises += required.size;
      if (required.size > 0 && missing === 0) {
        classesCompletes += 1;
      }
    }

    return {
      anneeScolaire: year ? { id: year.id, libelle: year.libelle } : null,
      joursClasse: settings.joursClasse,
      creneaux: {
        communs: slots.filter((s) => s.sectionId === null).length,
        parSection: slots.filter((s) => s.sectionId !== null).length,
      },
      matieres: {
        total: subjects.length,
        sansNiveau: subjects.filter((s) => s._count.levels === 0).length,
      },
      enseignants: {
        total: teachers.length,
        actifs: teachers.filter((t) => t.statut === 'ACTIF').length,
        sansAffectation: teachers.filter(
          (t) => t.statut === 'ACTIF' && t._count.assignments === 0,
        ).length,
      },
      affectations: {
        classes: (classes as unknown[]).length,
        classesCompletes,
        requises,
        manquantes,
      },
      trimestres: terms as number,
      calendrier: {
        vacances: eventCount('VACANCES'),
        feries: eventCount('FERIE'),
        autres: eventCount('AUTRE'),
      },
      salles: rooms,
      pilote: pilot,
    };
  }
}
