import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { normalize, toMinutes } from './pedagogy.util';
import {
  CreateRoomDto,
  CreateSubjectDto,
  CreateTimeSlotDto,
  SetSubjectLevelsDto,
  UpdateRoomDto,
  UpdateSubjectDto,
  UpdateTimeSlotDto,
} from './dto/pedagogy.dto';

/** Créneaux horaires, salles et matières : le référentiel saisi par la Direction. */
@Injectable()
export class ReferentialService {
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

  // ------------------------------------------------------------------ Créneaux

  async listTimeSlots(sectionId?: string) {
    return this.prisma.timeSlot.findMany({
      where: sectionId === undefined ? {} : { sectionId: sectionId || null },
      orderBy: [{ sectionId: 'asc' }, { heureDebut: 'asc' }],
    });
  }

  /** Deux créneaux d'une même grille (commune, ou d'une même section) ne peuvent pas se chevaucher. */
  private async assertNoOverlap(
    sectionId: string | null,
    heureDebut: string,
    heureFin: string,
    excludeId?: string,
  ) {
    if (toMinutes(heureDebut) >= toMinutes(heureFin)) {
      throw new BadRequestException(
        "L'heure de fin doit être après l'heure de début.",
      );
    }
    const same = await this.prisma.timeSlot.findMany({
      where: { sectionId, id: excludeId ? { not: excludeId } : undefined },
    });
    const start = toMinutes(heureDebut);
    const end = toMinutes(heureFin);
    const clash = same.find(
      (s) => start < toMinutes(s.heureFin) && end > toMinutes(s.heureDebut),
    );
    if (clash) {
      throw new ConflictException(
        `Ce créneau chevauche « ${clash.libelle} » (${clash.heureDebut} - ${clash.heureFin}).`,
      );
    }
  }

  async createTimeSlot(dto: CreateTimeSlotDto, userId: string) {
    const schoolId = await this.school.getDefaultId();
    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({
        where: { id: dto.sectionId },
      });
      if (!section) {
        throw new NotFoundException('Section introuvable.');
      }
    }
    const sectionId = dto.sectionId ?? null;
    await this.assertNoOverlap(sectionId, dto.heureDebut, dto.heureFin);

    const slot = await this.prisma.timeSlot.create({
      data: {
        schoolId,
        sectionId,
        libelle: dto.libelle.trim(),
        heureDebut: dto.heureDebut,
        heureFin: dto.heureFin,
        type: dto.type ?? 'COURS',
      },
    });
    await this.log(userId, 'TIME_SLOT_CREATE', 'TimeSlot', slot.id, null, slot);
    return slot;
  }

  async updateTimeSlot(id: string, dto: UpdateTimeSlotDto, userId: string) {
    const before = await this.prisma.timeSlot.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Créneau introuvable.');
    }
    const heureDebut = dto.heureDebut ?? before.heureDebut;
    const heureFin = dto.heureFin ?? before.heureFin;
    if (
      heureDebut !== before.heureDebut ||
      heureFin !== before.heureFin ||
      (dto.type !== undefined && dto.type !== before.type)
    ) {
      // Les séances copient les heures du créneau : les changer ici les désynchroniserait.
      const used = await this.prisma.timetableEntry.count({ where: { timeSlotId: id } });
      if (used > 0) {
        throw new ConflictException(
          'Ce créneau est utilisé dans un emploi du temps : ses heures et son type ne peuvent plus changer. Créez un nouveau créneau et déplacez les séances.',
        );
      }
    }
    await this.assertNoOverlap(before.sectionId, heureDebut, heureFin, id);

    const slot = await this.prisma.timeSlot.update({
      where: { id },
      data: {
        libelle: dto.libelle?.trim(),
        heureDebut,
        heureFin,
        type: dto.type,
      },
    });
    await this.log(userId, 'TIME_SLOT_UPDATE', 'TimeSlot', id, before, slot);
    return slot;
  }

  async deleteTimeSlot(id: string, userId: string) {
    const before = await this.prisma.timeSlot.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Créneau introuvable.');
    }
    if ((await this.prisma.timetableEntry.count({ where: { timeSlotId: id } })) > 0) {
      throw new ConflictException('Ce créneau est utilisé dans un emploi du temps : il ne peut pas être supprimé.');
    }
    await this.prisma.timeSlot.delete({ where: { id } });
    await this.log(userId, 'TIME_SLOT_DELETE', 'TimeSlot', id, before, null);
    return { id };
  }

  // -------------------------------------------------------------------- Salles

  listRooms() {
    return this.prisma.room.findMany({ orderBy: { nom: 'asc' } });
  }

  private async assertRoomNameFree(nom: string, excludeId?: string) {
    const rooms = await this.prisma.room.findMany();
    const clash = rooms.find(
      (r) => r.id !== excludeId && normalize(r.nom) === normalize(nom),
    );
    if (clash) {
      throw new ConflictException('Une salle porte déjà ce nom.');
    }
  }

  async createRoom(dto: CreateRoomDto, userId: string) {
    await this.assertRoomNameFree(dto.nom);
    const room = await this.prisma.room.create({
      data: {
        schoolId: await this.school.getDefaultId(),
        nom: dto.nom.trim(),
        capacite: dto.capacite,
      },
    });
    await this.log(userId, 'ROOM_CREATE', 'Room', room.id, null, room);
    return room;
  }

  async updateRoom(id: string, dto: UpdateRoomDto, userId: string) {
    const before = await this.prisma.room.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Salle introuvable.');
    }
    if (dto.nom) {
      await this.assertRoomNameFree(dto.nom, id);
    }
    const room = await this.prisma.room.update({
      where: { id },
      data: {
        nom: dto.nom?.trim(),
        capacite: dto.capacite,
        actif: dto.actif,
      },
    });
    await this.log(userId, 'ROOM_UPDATE', 'Room', id, before, room);
    return room;
  }

  async deleteRoom(id: string, userId: string) {
    const before = await this.prisma.room.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Salle introuvable.');
    }
    const used =
      (await this.prisma.timetableEntry.count({ where: { roomId: id } })) +
      (await this.prisma.timetableException.count({ where: { roomId: id } }));
    if (used > 0) {
      throw new ConflictException('Cette salle est utilisée dans un emploi du temps : désactivez-la plutôt que de la supprimer.');
    }
    // Son QR de pointage n'a plus d'objet une fois la salle supprimée.
    await this.prisma.pointageCode.deleteMany({ where: { roomId: id } });
    await this.prisma.room.delete({ where: { id } });
    await this.log(userId, 'ROOM_DELETE', 'Room', id, before, null);
    return { id };
  }

  // ------------------------------------------------------------------ Matières

  listSubjects() {
    return this.prisma.subject.findMany({
      orderBy: { nom: 'asc' },
      include: {
        levels: {
          include: { level: { include: { cycle: { include: { section: true } } } } },
        },
        _count: { select: { teachers: true, assignments: true } },
      },
    });
  }

  private async assertSubjectCodeFree(code: string, excludeId?: string) {
    const subjects = await this.prisma.subject.findMany();
    const clash = subjects.find(
      (s) => s.id !== excludeId && normalize(s.code) === normalize(code),
    );
    if (clash) {
      throw new ConflictException(`Le code « ${clash.code} » existe déjà.`);
    }
  }

  async createSubject(dto: CreateSubjectDto, userId: string) {
    const code = dto.code.trim().toUpperCase();
    await this.assertSubjectCodeFree(code);
    const subject = await this.prisma.subject.create({
      data: {
        schoolId: await this.school.getDefaultId(),
        code,
        nom: dto.nom.trim(),
      },
    });
    await this.log(userId, 'SUBJECT_CREATE', 'Subject', subject.id, null, subject);
    return subject;
  }

  async updateSubject(id: string, dto: UpdateSubjectDto, userId: string) {
    const before = await this.prisma.subject.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Matière introuvable.');
    }
    const code = dto.code?.trim().toUpperCase();
    if (code) {
      await this.assertSubjectCodeFree(code, id);
    }
    const subject = await this.prisma.subject.update({
      where: { id },
      data: { code, nom: dto.nom?.trim(), actif: dto.actif },
    });
    await this.log(userId, 'SUBJECT_UPDATE', 'Subject', id, before, subject);
    return subject;
  }

  async deleteSubject(id: string, userId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { levels: true, teachers: true, assignments: true } } },
    });
    if (!subject) {
      throw new NotFoundException('Matière introuvable.');
    }
    const { levels, teachers, assignments } = subject._count;
    if (levels + teachers + assignments > 0) {
      throw new ConflictException(
        'Cette matière est utilisée (niveaux, enseignants ou affectations). Désactivez-la plutôt que de la supprimer.',
      );
    }
    await this.prisma.subject.delete({ where: { id } });
    await this.log(userId, 'SUBJECT_DELETE', 'Subject', id, subject, null);
    return { id };
  }

  /**
   * Remplace l'ensemble des niveaux auxquels une matière est enseignée. Retirer un niveau alors
   * qu'une classe de ce niveau a déjà un enseignant affecté à cette matière est refusé : il faut
   * d'abord supprimer l'affectation, sinon elle deviendrait incohérente.
   */
  async setSubjectLevels(id: string, dto: SetSubjectLevelsDto, userId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { levels: true },
    });
    if (!subject) {
      throw new NotFoundException('Matière introuvable.');
    }
    const wanted = new Map<string, number | undefined>();
    for (const l of dto.levels) {
      wanted.set(l.levelId, l.minutesParSemaine);
    }
    const existingLevels = await this.prisma.level.findMany({
      where: { id: { in: [...wanted.keys()] } },
      select: { id: true },
    });
    if (existingLevels.length !== wanted.size) {
      throw new NotFoundException('Un des niveaux est introuvable.');
    }

    const removed = subject.levels.filter((l) => !wanted.has(l.levelId));
    for (const r of removed) {
      const blocking = await this.prisma.teachingAssignment.count({
        where: { subjectId: id, class: { levelId: r.levelId } },
      });
      if (blocking > 0) {
        throw new ConflictException(
          'Impossible de retirer ce niveau : des classes de ce niveau ont un enseignant affecté à cette matière. Supprimez d’abord ces affectations.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.subjectLevel.deleteMany({ where: { subjectId: id } }),
      this.prisma.subjectLevel.createMany({
        data: [...wanted.entries()].map(([levelId, minutesParSemaine]) => ({
          subjectId: id,
          levelId,
          minutesParSemaine: minutesParSemaine ?? null,
        })),
      }),
    ]);

    const after = await this.prisma.subjectLevel.findMany({ where: { subjectId: id } });
    await this.log(
      userId,
      'SUBJECT_LEVELS_UPDATE',
      'Subject',
      id,
      subject.levels,
      after,
    );
    return after;
  }
}
