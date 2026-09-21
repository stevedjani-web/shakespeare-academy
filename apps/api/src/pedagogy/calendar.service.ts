import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { isoDay, toDateOnly } from './pedagogy.util';
import {
  CreateCalendarEventDto,
  CreateTermDto,
  UpdateCalendarEventDto,
  UpdateTermDto,
} from './dto/pedagogy.dto';

/** Trimestres et calendrier scolaire (vacances, jours fériés) d'une année scolaire (D55). */
@Injectable()
export class CalendarService {
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

  /** Année modifiable : elle existe et n'est pas clôturée (une année clôturée ne se modifie plus). */
  private async editableYear(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year) {
      throw new NotFoundException('Année scolaire introuvable.');
    }
    if (year.statut === 'CLOTUREE') {
      throw new ConflictException(
        'Cette année scolaire est clôturée : son calendrier ne peut plus être modifié.',
      );
    }
    return year;
  }

  private assertOrdered(debut: string, fin: string) {
    if (debut > fin) {
      throw new BadRequestException(
        'La date de fin doit être égale ou postérieure à la date de début.',
      );
    }
  }

  private assertInsideYear(
    year: { dateDebut: Date; dateFin: Date; libelle: string },
    debut: string,
    fin: string,
  ) {
    if (debut < isoDay(year.dateDebut) || fin > isoDay(year.dateFin)) {
      throw new UnprocessableEntityException(
        `Les dates doivent rester dans l'année scolaire ${year.libelle} (${isoDay(year.dateDebut)} au ${isoDay(year.dateFin)}).`,
      );
    }
  }

  // ---------------------------------------------------------------- Trimestres

  listTerms(academicYearId?: string) {
    return this.prisma.term.findMany({
      where: { academicYearId: academicYearId || undefined },
      orderBy: [{ academicYearId: 'asc' }, { ordre: 'asc' }],
    });
  }

  private async assertTermNoOverlap(
    academicYearId: string,
    debut: string,
    fin: string,
    excludeId?: string,
  ) {
    const others = await this.prisma.term.findMany({
      where: { academicYearId, id: excludeId ? { not: excludeId } : undefined },
    });
    const clash = others.find(
      (t) => debut <= isoDay(t.dateFin) && fin >= isoDay(t.dateDebut),
    );
    if (clash) {
      throw new ConflictException(
        `Ces dates chevauchent « ${clash.libelle} » (${isoDay(clash.dateDebut)} au ${isoDay(clash.dateFin)}).`,
      );
    }
  }

  async createTerm(dto: CreateTermDto, userId: string) {
    const year = await this.editableYear(dto.academicYearId);
    this.assertOrdered(dto.dateDebut, dto.dateFin);
    this.assertInsideYear(year, dto.dateDebut, dto.dateFin);
    await this.assertTermNoOverlap(year.id, dto.dateDebut, dto.dateFin);

    let ordre = dto.ordre;
    if (ordre === undefined) {
      const last = await this.prisma.term.findFirst({
        where: { academicYearId: year.id },
        orderBy: { ordre: 'desc' },
      });
      ordre = (last?.ordre ?? 0) + 1;
    } else if (
      await this.prisma.term.findFirst({
        where: { academicYearId: year.id, ordre },
      })
    ) {
      throw new ConflictException(`Le trimestre n° ${ordre} existe déjà pour cette année.`);
    }

    const term = await this.prisma.term.create({
      data: {
        academicYearId: year.id,
        libelle: dto.libelle.trim(),
        dateDebut: toDateOnly(dto.dateDebut),
        dateFin: toDateOnly(dto.dateFin),
        ordre,
      },
    });
    await this.log(userId, 'TERM_CREATE', 'Term', term.id, null, term);
    return term;
  }

  async updateTerm(id: string, dto: UpdateTermDto, userId: string) {
    const before = await this.prisma.term.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Trimestre introuvable.');
    }
    const year = await this.editableYear(before.academicYearId);
    const debut = dto.dateDebut ?? isoDay(before.dateDebut);
    const fin = dto.dateFin ?? isoDay(before.dateFin);
    this.assertOrdered(debut, fin);
    this.assertInsideYear(year, debut, fin);
    await this.assertTermNoOverlap(year.id, debut, fin, id);

    const term = await this.prisma.term.update({
      where: { id },
      data: {
        libelle: dto.libelle?.trim(),
        dateDebut: toDateOnly(debut),
        dateFin: toDateOnly(fin),
      },
    });
    await this.log(userId, 'TERM_UPDATE', 'Term', id, before, term);
    return term;
  }

  async deleteTerm(id: string, userId: string) {
    const before = await this.prisma.term.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Trimestre introuvable.');
    }
    await this.editableYear(before.academicYearId);
    await this.prisma.term.delete({ where: { id } });
    await this.log(userId, 'TERM_DELETE', 'Term', id, before, null);
    return { id };
  }

  // ------------------------------------------------------ Vacances et jours fériés

  listEvents(academicYearId?: string) {
    return this.prisma.calendarEvent.findMany({
      where: { academicYearId: academicYearId || undefined },
      orderBy: [{ dateDebut: 'asc' }],
    });
  }

  async createEvent(dto: CreateCalendarEventDto, userId: string) {
    const year = await this.editableYear(dto.academicYearId);
    const fin = dto.dateFin ?? dto.dateDebut;
    this.assertOrdered(dto.dateDebut, fin);
    this.assertInsideYear(year, dto.dateDebut, fin);

    const event = await this.prisma.calendarEvent.create({
      data: {
        academicYearId: year.id,
        type: dto.type,
        libelle: dto.libelle.trim(),
        dateDebut: toDateOnly(dto.dateDebut),
        dateFin: toDateOnly(fin),
      },
    });
    await this.log(userId, 'CALENDAR_EVENT_CREATE', 'CalendarEvent', event.id, null, event);
    return event;
  }

  async updateEvent(id: string, dto: UpdateCalendarEventDto, userId: string) {
    const before = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Événement introuvable.');
    }
    const year = await this.editableYear(before.academicYearId);
    const debut = dto.dateDebut ?? isoDay(before.dateDebut);
    const fin = dto.dateFin ?? isoDay(before.dateFin);
    this.assertOrdered(debut, fin);
    this.assertInsideYear(year, debut, fin);

    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        type: dto.type,
        libelle: dto.libelle?.trim(),
        dateDebut: toDateOnly(debut),
        dateFin: toDateOnly(fin),
      },
    });
    await this.log(userId, 'CALENDAR_EVENT_UPDATE', 'CalendarEvent', id, before, event);
    return event;
  }

  async deleteEvent(id: string, userId: string) {
    const before = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Événement introuvable.');
    }
    await this.editableYear(before.academicYearId);
    await this.prisma.calendarEvent.delete({ where: { id } });
    await this.log(userId, 'CALENDAR_EVENT_DELETE', 'CalendarEvent', id, before, null);
    return { id };
  }
}
