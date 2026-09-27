import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
import {
  badBulletin,
  detectBulletinType,
  isStoredBulletinName,
  PREREGISTRATION_FILES_DIR,
  removeBulletin,
  safeDisplayName,
  storeBulletin,
} from './preregistration-files';
import { join } from 'path';
import { pick } from '../common/language';

const REFERENCE_DIGITS = 6;

/** Un bulletin reçu avec le formulaire, rattaché à la fiche enfant de même rang (0, 1, 2…). */
export interface UploadedBulletin {
  index: number;
  buffer: Buffer;
  originalname: string;
}

const CHILD_INCLUDE = {
  level: { select: { id: true, nom: true } },
  classePrecedente: { select: { id: true, nom: true } },
} satisfies Prisma.PreRegistrationChildInclude;

type ChildRow = Prisma.PreRegistrationChildGetPayload<{
  include: typeof CHILD_INCLUDE;
}>;

/**
 * Préinscription en ligne (Lot 21) : une famille dépose une demande sans compte ni élève existant. Une demande porte un
 * parent ou tuteur, saisi une seule fois, et un ou plusieurs enfants, chacun avec sa classe demandée, son statut
 * (nouvel élève ou ancien élève) et ses documents. Le secrétariat examine chaque enfant à part puis, en l'acceptant,
 * choisit la classe réelle et déclenche la création de l'élève et de son inscription en réutilisant tels quels
 * StudentsService (doublon D33, matricule) et EnrollmentsService (numéro, facture, RG01).
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
            levels: {
              orderBy: { ordre: 'asc' },
              select: { id: true, nom: true },
            },
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

  async create(dto: CreatePreRegistrationDto, bulletins: UploadedBulletin[]) {
    const schoolId = await this.schoolService.getDefaultId();
    const enfants = dto.enfants;
    const label = (i: number) =>
      `${enfants[i].prenom.trim()} ${enfants[i].nom.trim()}`;

    // Niveaux : Level n'a pas de schoolId direct (il descend de Cycle → Section), d'où la jointure explicite.
    const levelIds = [
      ...new Set(
        enfants.flatMap((e) =>
          e.classePrecedenteLevelId && e.typeEleve === 'ANCIEN'
            ? [e.levelId, e.classePrecedenteLevelId]
            : [e.levelId],
        ),
      ),
    ];
    const levels = await this.prisma.level.findMany({
      where: { id: { in: levelIds }, cycle: { section: { schoolId } } },
      select: { id: true, nom: true },
    });
    const levelName = new Map(levels.map((l) => [l.id, l.nom]));
    enfants.forEach((e, i) => {
      if (!levelName.has(e.levelId)) {
        throw new BadRequestException(
          pick({
            fr: `Classe demandée inconnue pour ${label(i)}.`,
            en: `Unknown requested class for ${label(i)}.`,
          }),
        );
      }
      if (
        e.typeEleve === 'ANCIEN' &&
        !levelName.has(e.classePrecedenteLevelId as string)
      ) {
        throw new BadRequestException(
          pick({
            fr: `Classe fréquentée l’année précédente inconnue pour ${label(i)}.`,
            en: `Unknown class attended last year for ${label(i)}.`,
          }),
        );
      }
    });

    const dates = enfants.map((e, i) => {
      const d = new Date(e.dateNaissance);
      if (Number.isNaN(d.getTime()) || d > new Date()) {
        throw new BadRequestException(
          pick({
            fr: `Date de naissance invalide pour ${label(i)}.`,
            en: `Invalid date of birth for ${label(i)}.`,
          }),
        );
      }
      return d;
    });

    // Un même enfant ne figure pas deux fois dans la demande.
    const keys = enfants.map(
      (e, i) =>
        `${normalizeText(e.nom)}|${normalizeText(e.prenom)}|${dates[i].toISOString().slice(0, 10)}`,
    );
    const twice = keys.findIndex((k, i) => keys.indexOf(k) !== i);
    if (twice >= 0) {
      throw new BadRequestException(
        pick({
          fr: `${label(twice)} figure deux fois dans la demande.`,
          en: `${label(twice)} appears twice in the request.`,
        }),
      );
    }

    // Une même demande, encore en attente, ne se dépose pas deux fois : une réponse déjà donnée (acceptée ou
    // refusée) n'empêche jamais une nouvelle demande (une famille refusée peut retenter, une acceptée n'a plus lieu).
    const pending = await this.prisma.preRegistrationChild.findMany({
      where: {
        statut: 'EN_ATTENTE',
        preRegistration: { schoolId },
        dateNaissance: { in: dates },
      },
      select: { nom: true, prenom: true, dateNaissance: true },
    });
    const pendingKeys = new Set(
      pending.map(
        (p) =>
          `${normalizeText(p.nom)}|${normalizeText(p.prenom)}|${p.dateNaissance.toISOString().slice(0, 10)}`,
      ),
    );
    const already = keys.findIndex((k) => pendingKeys.has(k));
    if (already >= 0) {
      throw new ConflictException(
        pick({
          fr: `Une demande est déjà en attente pour ${label(already)} : inutile de la redéposer.`,
          en: `A request is already pending for ${label(already)}: there is no need to submit it again.`,
        }),
      );
    }

    // Bulletins : un par enfant au plus, réservés aux nouveaux élèves, type vérifié sur le contenu.
    const detected = new Map<
      number,
      { file: UploadedBulletin; type: ReturnType<typeof detectBulletinType> }
    >();
    for (const file of bulletins) {
      const i = file.index;
      if (!Number.isInteger(i) || i < 0 || i >= enfants.length) {
        throw new BadRequestException(
          pick({
            fr: 'Bulletin rattaché à un enfant inconnu.',
            en: 'Report attached to an unknown child.',
          }),
        );
      }
      if (enfants[i].typeEleve !== 'NOUVEAU') {
        throw new BadRequestException(
          pick({
            fr: `Le bulletin n’est demandé que pour un nouvel élève (${label(i)}).`,
            en: `A report is only requested for a new student (${label(i)}).`,
          }),
        );
      }
      if (detected.has(i)) {
        throw new BadRequestException(
          pick({
            fr: `Un seul bulletin par enfant (${label(i)}).`,
            en: `Only one report per child (${label(i)}).`,
          }),
        );
      }
      const type = detectBulletinType(file.buffer);
      if (!type) throw badBulletin(enfants[i].prenom.trim());
      detected.set(i, { file, type });
    }

    const year = new Date().getFullYear();
    const sequence = await this.numberSequenceService.next(
      schoolId,
      'PREINSCRIPTION',
      String(year),
    );
    const reference = `PREINS-${year}-${String(sequence).padStart(REFERENCE_DIGITS, '0')}`;

    // Les fichiers sont écrits juste avant la base ; s'il échoue quelque chose, ils sont retirés (aucun orphelin).
    const stored: string[] = [];
    const bulletinData = new Map<
      number,
      {
        bulletinFichier: string;
        bulletinNom: string;
        bulletinType: string;
        bulletinTaille: number;
      }
    >();
    try {
      for (const [i, { file, type }] of detected) {
        const name = await storeBulletin(
          file.buffer,
          type as NonNullable<typeof type>,
        );
        stored.push(name);
        bulletinData.set(i, {
          bulletinFichier: name,
          bulletinNom: safeDisplayName(file.originalname),
          bulletinType: (type as NonNullable<typeof type>).type,
          bulletinTaille: file.buffer.length,
        });
      }

      const created = await this.prisma.preRegistration.create({
        data: {
          schoolId,
          reference,
          responsableNom: dto.responsable.nom.trim(),
          responsablePrenom: dto.responsable.prenom.trim(),
          responsableTelephone: dto.responsable.telephone.trim(),
          responsableEmail: dto.responsable.email?.trim() || null,
          message: dto.message?.trim() || null,
          enfants: {
            create: enfants.map((e, i) => ({
              ordre: i,
              nom: e.nom.trim(),
              prenom: e.prenom.trim(),
              sexe: e.sexe,
              dateNaissance: dates[i],
              lieuNaissance: e.lieuNaissance?.trim() || null,
              nationalite: e.nationalite?.trim() || null,
              levelId: e.levelId,
              typeEleve: e.typeEleve,
              ancienEtablissement:
                e.typeEleve === 'NOUVEAU'
                  ? e.ancienEtablissement?.trim() || null
                  : null,
              classePrecedenteLevelId:
                e.typeEleve === 'ANCIEN' ? e.classePrecedenteLevelId : null,
              ...(bulletinData.get(i) ?? {}),
            })),
          },
        },
        include: { enfants: { orderBy: { ordre: 'asc' } } },
      });

      // Le journal ne garde que des identifiants et des comptes : jamais un nom, un message ni un nom de fichier.
      await this.audit.log({
        schoolId,
        userId: null,
        action: 'PREREGISTRATION_CREATE',
        entite: 'PreRegistration',
        entiteId: created.id,
        nouvelleValeur: {
          reference: created.reference,
          enfants: created.enfants.length,
          nouveaux: created.enfants.filter((c) => c.typeEleve === 'NOUVEAU')
            .length,
          anciens: created.enfants.filter((c) => c.typeEleve === 'ANCIEN')
            .length,
          bulletins: bulletinData.size,
          niveaux: created.enfants.map((c) => c.levelId),
        },
      });

      return {
        reference: created.reference,
        responsable: {
          prenom: created.responsablePrenom,
          nom: created.responsableNom,
        },
        // Ce qui a réellement été enregistré, enfant par enfant : le récapitulatif de la famille en est tiré.
        enfants: created.enfants.map((c) => ({
          prenom: c.prenom,
          nom: c.nom,
          classeDemandee: levelName.get(c.levelId) ?? '',
          typeEleve: c.typeEleve,
          classePrecedente: c.classePrecedenteLevelId
            ? (levelName.get(c.classePrecedenteLevelId) ?? null)
            : null,
          ancienEtablissement: c.ancienEtablissement,
          bulletinJoint: !!c.bulletinFichier,
        })),
      };
    } catch (err) {
      await Promise.all(stored.map((name) => removeBulletin(name)));
      throw err;
    }
  }

  /** Suivi public : la référence seule ne suffit pas (séquentielle, devinable) ; le téléphone doit correspondre. */
  async track(reference: string, telephone: string) {
    const row = await this.prisma.preRegistration.findUnique({
      where: { reference: reference.trim() },
      include: {
        enfants: { orderBy: { ordre: 'asc' }, include: CHILD_INCLUDE },
      },
    });
    if (!row || row.responsableTelephone !== telephone.trim()) {
      throw new NotFoundException(
        pick({
          fr: 'Aucune demande ne correspond à cette référence et ce téléphone.',
          en: 'No request matches this reference and phone number.',
        }),
      );
    }
    return {
      reference: row.reference,
      dateDepot: row.createdAt,
      // Chaque enfant a sa réponse : l'un peut être accepté, l'autre refusé ou encore à l'étude.
      enfants: row.enfants.map((c) => ({
        enfant: `${c.prenom} ${c.nom}`,
        classeDemandee: c.level.nom,
        typeEleve: c.typeEleve,
        statut: c.statut,
        motifRejet: c.statut === 'REJETEE' ? c.motifRejet : null,
        dateTraitement: c.traiteLe,
      })),
    };
  }

  private async findOrThrow(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const row = await this.prisma.preRegistration.findFirst({
      where: { id, schoolId },
      include: {
        enfants: { orderBy: { ordre: 'asc' }, include: CHILD_INCLUDE },
      },
    });
    if (!row) throw new NotFoundException('Préinscription introuvable.');
    return row;
  }

  private async findChildOrThrow(childId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const child = await this.prisma.preRegistrationChild.findFirst({
      where: { id: childId, preRegistration: { schoolId } },
      include: { ...CHILD_INCLUDE, preRegistration: true },
    });
    if (!child) throw new NotFoundException('Fiche enfant introuvable.');
    return child;
  }

  async list(statut?: 'EN_ATTENTE' | 'TRAITEE') {
    const schoolId = await this.schoolService.getDefaultId();
    const rows = await this.prisma.preRegistration.findMany({
      where: {
        schoolId,
        ...(statut === 'EN_ATTENTE'
          ? { enfants: { some: { statut: 'EN_ATTENTE' as const } } }
          : statut === 'TRAITEE'
            ? { enfants: { none: { statut: 'EN_ATTENTE' as const } } }
            : {}),
      },
      include: {
        enfants: { orderBy: { ordre: 'asc' }, include: CHILD_INCLUDE },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((r) => this.present(r));
  }

  async findOne(id: string) {
    return this.present(await this.findOrThrow(id));
  }

  private presentChild(c: ChildRow) {
    return {
      id: c.id,
      ordre: c.ordre,
      eleve: {
        nom: c.nom,
        prenom: c.prenom,
        sexe: c.sexe,
        dateNaissance: c.dateNaissance.toISOString().slice(0, 10),
        lieuNaissance: c.lieuNaissance,
        nationalite: c.nationalite,
      },
      niveau: c.level,
      typeEleve: c.typeEleve,
      ancienEtablissement: c.ancienEtablissement,
      classePrecedente: c.classePrecedente,
      bulletin: c.bulletinFichier
        ? {
            nom: c.bulletinNom,
            type: c.bulletinType,
            taille: c.bulletinTaille,
          }
        : null,
      statut: c.statut,
      motifRejet: c.motifRejet,
      studentId: c.studentId,
      enrollmentId: c.enrollmentId,
      traiteLe: c.traiteLe,
    };
  }

  private present(
    row: Prisma.PreRegistrationGetPayload<{
      include: { enfants: { include: typeof CHILD_INCLUDE } };
    }>,
  ) {
    const enAttente = row.enfants.filter(
      (c) => c.statut === 'EN_ATTENTE',
    ).length;
    return {
      id: row.id,
      reference: row.reference,
      // Vue d'ensemble de la demande : à traiter tant qu'un enfant attend une réponse.
      statut: enAttente > 0 ? 'EN_ATTENTE' : 'TRAITEE',
      compte: {
        enfants: row.enfants.length,
        enAttente,
        acceptes: row.enfants.filter((c) => c.statut === 'ACCEPTEE').length,
        refuses: row.enfants.filter((c) => c.statut === 'REJETEE').length,
      },
      responsable: {
        nom: row.responsableNom,
        prenom: row.responsablePrenom,
        telephone: row.responsableTelephone,
        email: row.responsableEmail,
      },
      message: row.message,
      createdAt: row.createdAt,
      enfants: row.enfants.map((c) => this.presentChild(c)),
    };
  }

  /**
   * Accepter UN enfant le convertit en élève et inscription réels, en réutilisant les services existants (D33, RG01,
   * facture) sans les dupliquer. Un ancien élève dont le dossier a été retrouvé (`studentId`) n'est pas recréé : seule
   * son inscription est ajoutée. Sans dossier retrouvé, un élève est créé ; le type d'inscription suit alors le choix
   * du parent (ancien élève : réinscription, nouvel élève : inscription). Si l'inscription échoue après la création de
   * l'élève, celui-ci reste utilisable (comme dans l'assistant d'inscription du dashboard, deux appels non atomiques) :
   * le secrétariat termine alors l'inscription depuis le dossier de l'élève.
   */
  async accept(
    childId: string,
    dto: AcceptPreRegistrationDto,
    actingUserId: string,
  ) {
    const child = await this.findChildOrThrow(childId);
    if (child.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cet enfant a déjà été traité.');
    }
    const klass = await this.classesService.findOne(dto.classId);
    const parent = child.preRegistration;

    let studentId: string;
    if (dto.studentId) {
      const existing = await this.prisma.student.findFirst({
        where: { id: dto.studentId, schoolId: parent.schoolId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Élève introuvable.');
      studentId = existing.id;
    } else {
      const student = await this.studentsService.create(
        {
          nom: child.nom,
          prenom: child.prenom,
          sexe: child.sexe,
          dateNaissance: child.dateNaissance.toISOString().slice(0, 10),
          lieuNaissance: child.lieuNaissance ?? undefined,
          nationalite: child.nationalite ?? undefined,
          responsable: {
            nom: parent.responsableNom,
            prenom: parent.responsablePrenom,
            telephone: parent.responsableTelephone,
            email: parent.responsableEmail ?? undefined,
            lien: 'Parent',
          },
          forcerCreation: dto.forcerCreation,
        },
        actingUserId,
      );
      studentId = student.id;
    }

    const enrollment = await this.enrollmentsService.create(
      {
        studentId,
        classId: klass.id,
        academicYearId: klass.academicYearId,
        // Dossier retrouvé : le type se déduit de son historique. Élève créé ici : il suit le choix du parent.
        ...(dto.studentId
          ? {}
          : {
              type:
                child.typeEleve === 'ANCIEN' ? 'REINSCRIPTION' : 'INSCRIPTION',
            }),
      },
      actingUserId,
    );

    await this.prisma.preRegistrationChild.update({
      where: { id: child.id },
      data: {
        statut: 'ACCEPTEE',
        studentId,
        enrollmentId: enrollment.id,
        traiteParUserId: actingUserId,
        traiteLe: new Date(),
      },
    });
    await this.audit.log({
      schoolId: parent.schoolId,
      userId: actingUserId,
      action: 'PREREGISTRATION_ACCEPT',
      entite: 'PreRegistrationChild',
      entiteId: child.id,
      nouvelleValeur: {
        reference: parent.reference,
        studentId,
        enrollmentId: enrollment.id,
        dossierRetrouve: !!dto.studentId,
      },
    });
    return this.findOne(parent.id);
  }

  async reject(childId: string, motif: string, actingUserId: string) {
    const child = await this.findChildOrThrow(childId);
    if (child.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cet enfant a déjà été traité.');
    }
    await this.prisma.preRegistrationChild.update({
      where: { id: child.id },
      data: {
        statut: 'REJETEE',
        motifRejet: motif.trim(),
        traiteParUserId: actingUserId,
        traiteLe: new Date(),
      },
    });
    await this.audit.log({
      schoolId: child.preRegistration.schoolId,
      userId: actingUserId,
      action: 'PREREGISTRATION_REJECT',
      entite: 'PreRegistrationChild',
      entiteId: child.id,
      nouvelleValeur: {
        reference: child.preRegistration.reference,
        motif: motif.trim(),
      },
    });
    return this.findOne(child.preRegistrationId);
  }

  /** Le bulletin d'un enfant : chemin sur le disque, nom affiché et type, pour le personnel habilité seulement. */
  async bulletinFile(childId: string, actingUserId: string) {
    const child = await this.findChildOrThrow(childId);
    if (
      !child.bulletinFichier ||
      !isStoredBulletinName(child.bulletinFichier)
    ) {
      throw new NotFoundException('Aucun bulletin joint pour cet enfant.');
    }
    await this.audit.log({
      schoolId: child.preRegistration.schoolId,
      userId: actingUserId,
      action: 'PREREGISTRATION_BULLETIN_READ',
      entite: 'PreRegistrationChild',
      entiteId: child.id,
    });
    return {
      path: join(PREREGISTRATION_FILES_DIR, child.bulletinFichier),
      nom: child.bulletinNom ?? 'bulletin',
      type: child.bulletinType ?? 'application/octet-stream',
    };
  }
}
