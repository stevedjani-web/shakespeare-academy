import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Teacher } from '@prisma/client';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import { phoneKey } from '../common/phone.util';
import { assertCanHandleReserved } from '../auth/reserved-permissions';
import type { CurrentUserData } from '../auth/types/current-user.interface';
import { matchNames } from '../family-collection/family-matching.util';
import {
  LINK_DEFAULT_DAYS,
  LINK_MAX_DAYS,
  STAFF_CONSENT_VERSION,
  TEACHER_ROLE_CODE,
  isSecondaryCycle,
} from './teacher-onboarding.util';
import {
  removeTeacherPhoto,
  storeTeacherPhoto,
  teacherPhotoPath,
} from './teacher-photo';
import type {
  ListTeacherSubmissionsQueryDto,
  SubmitTeacherDto,
  UpdateTeacherLinkDto,
  ValidateTeacherSubmissionDto,
} from './dto/teacher-onboarding.dto';

type Severity = 'BLOQUANT' | 'CONFIRMATION' | 'INFO';
export interface TeacherAlert {
  code: string;
  gravite: Severity;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une classe telle que la voient la page publique et le secrétariat. */
export interface TeacherClassView {
  id: string;
  nom: string;
  niveau: string;
  cycle: string;
  section: string;
  // Collège ou lycée : l'enseignant y intervient par matière, on lui demande donc ses matières.
  secondaire: boolean;
}

const CLASS_WITH_LEVEL = {
  level: {
    select: {
      nom: true,
      ordre: true,
      createdAt: true,
      cycle: {
        select: {
          code: true,
          nom: true,
          ordre: true,
          createdAt: true,
          section: { select: { nom: true, createdAt: true } },
        },
      },
    },
  },
} as const;

type ClassRow = {
  id: string;
  nom: string;
  level: {
    nom: string;
    ordre: number;
    createdAt: Date;
    cycle: {
      code: string;
      nom: string;
      ordre: number;
      createdAt: Date;
      section: { nom: string; createdAt: Date };
    };
  };
};

function toClassView(c: ClassRow): TeacherClassView {
  return {
    id: c.id,
    nom: c.nom,
    niveau: c.level.nom,
    cycle: c.level.cycle.nom,
    section: c.level.cycle.section.nom,
    secondaire: isSecondaryCycle(c.level.cycle.code),
  };
}

/** Sections dans l'ordre de création, puis cycles, niveaux et classes : Maternelle avant Primaire avant Collège. */
function byStructure(a: ClassRow, b: ClassRow): number {
  const sa = a.level.cycle.section;
  const sb = b.level.cycle.section;
  return (
    sa.createdAt.getTime() - sb.createdAt.getTime() ||
    sa.nom.localeCompare(sb.nom) ||
    a.level.cycle.ordre - b.level.cycle.ordre ||
    a.level.cycle.createdAt.getTime() - b.level.cycle.createdAt.getTime() ||
    a.level.ordre - b.level.ordre ||
    a.level.createdAt.getTime() - b.level.createdAt.getTime() ||
    a.nom.localeCompare(b.nom, undefined, { numeric: true })
  );
}

/**
 * Collecte des informations des enseignants par un lien commun, validée par le secrétariat. Rien n'atteint les fiches ni
 * les comptes avant la validation ; le mot de passe choisi n'est conservé que sous forme d'empreinte, effacée dès que la
 * demande est traitée.
 */
@Injectable()
export class TeacherOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  // ------------------------------------------------------------------------------------------------------ lien

  async getLink() {
    const schoolId = await this.school.getDefaultId();
    const link = await this.prisma.teacherCollectLink.findUnique({
      where: { schoolId },
    });
    if (!link) return null;
    return {
      token: link.token,
      actif: link.actif,
      expiresAt: link.expiresAt,
      expire: link.expiresAt < new Date(),
    };
  }

  async createLink(
    regenerer: boolean,
    validiteJours: number | undefined,
    userId: string,
  ) {
    const schoolId = await this.school.getDefaultId();
    const existing = await this.prisma.teacherCollectLink.findUnique({
      where: { schoolId },
    });
    if (existing && !regenerer) return this.getLink();
    const days = validiteJours ?? LINK_DEFAULT_DAYS;
    const token = randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + days * DAY_MS);
    if (existing) {
      await this.prisma.teacherCollectLink.update({
        where: { id: existing.id },
        data: { token, actif: true, expiresAt, createdById: userId },
      });
    } else {
      await this.prisma.teacherCollectLink.create({
        data: { schoolId, token, expiresAt, createdById: userId },
      });
    }
    await this.audit.log({
      schoolId,
      userId,
      action: existing ? 'TEACHER_LINK_REGENERATE' : 'TEACHER_LINK_CREATE',
      entite: 'TeacherCollectLink',
      entiteId: schoolId,
      nouvelleValeur: { expiresAt, validiteJours: days },
    });
    return this.getLink();
  }

  async updateLink(dto: UpdateTeacherLinkDto, userId: string) {
    const schoolId = await this.school.getDefaultId();
    const link = await this.prisma.teacherCollectLink.findUnique({
      where: { schoolId },
    });
    if (!link) {
      throw new NotFoundException(
        "Aucun lien n'a encore été créé : créez-le d'abord.",
      );
    }
    const data: { actif?: boolean; expiresAt?: Date } = {};
    if (dto.actif !== undefined) data.actif = dto.actif;
    if (dto.prolongerJours) {
      const from = Math.max(link.expiresAt.getTime(), Date.now());
      data.expiresAt = new Date(
        from + Math.min(dto.prolongerJours, LINK_MAX_DAYS) * DAY_MS,
      );
    }
    if (Object.keys(data).length === 0) return this.getLink();
    await this.prisma.teacherCollectLink.update({
      where: { id: link.id },
      data,
    });
    if (dto.actif !== undefined && dto.actif !== link.actif) {
      await this.audit.log({
        schoolId,
        userId,
        action: dto.actif ? 'TEACHER_LINK_REOPEN' : 'TEACHER_LINK_CLOSE',
        entite: 'TeacherCollectLink',
        entiteId: schoolId,
      });
    }
    if (data.expiresAt) {
      await this.audit.log({
        schoolId,
        userId,
        action: 'TEACHER_LINK_EXTEND',
        entite: 'TeacherCollectLink',
        entiteId: schoolId,
        nouvelleValeur: { expiresAt: data.expiresAt },
      });
    }
    return this.getLink();
  }

  private async activeLink(token: string) {
    const link = await this.prisma.teacherCollectLink.findUnique({
      where: { token },
    });
    if (!link) {
      throw new NotFoundException(
        pick({ fr: 'Lien inconnu.', en: 'Unknown link.' }),
      );
    }
    if (!link.actif || link.expiresAt < new Date()) {
      throw new GoneException(
        pick({
          fr: 'Ce lien n’est plus actif. Contactez le secrétariat de l’école.',
          en: 'This link is no longer active. Contact the school office.',
        }),
      );
    }
    return link;
  }

  // ------------------------------------------------------------------------------------------------- public

  /** Classes de l'année active : celles que l'enseignant peut déclarer (aucun effectif, aucun nom d'élève). */
  private async activeYearClasses(): Promise<ClassRow[]> {
    const schoolId = await this.school.getDefaultId();
    const rows = await this.prisma.class.findMany({
      where: { academicYear: { schoolId, statut: 'ACTIVE' } },
      select: { id: true, nom: true, ...CLASS_WITH_LEVEL },
    });
    return rows.sort(byStructure);
  }

  /**
   * Ce que la page publique a besoin de savoir : l'école, les classes à choisir, les matières à cocher (secondaire
   * seulement, côté page), la version des conditions d'usage.
   */
  async publicInfo(token: string) {
    await this.activeLink(token);
    const schoolId = await this.school.getDefaultId();
    const [school, subjects, classes] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { nom: true },
      }),
      this.prisma.subject.findMany({
        where: { actif: true },
        orderBy: { nom: 'asc' },
        select: { id: true, nom: true },
      }),
      this.activeYearClasses(),
    ]);
    return {
      ecole: school.nom,
      classes: classes.map(toClassView),
      matieres: subjects,
      versionPolitique: STAFF_CONSENT_VERSION,
    };
  }

  async submit(token: string, dto: SubmitTeacherDto, photo?: Buffer) {
    const link = await this.activeLink(token);
    if (!dto.consentement) {
      throw new BadRequestException(
        pick({
          fr: 'Vous devez accepter les conditions d’usage pour envoyer vos informations.',
          en: 'You must accept the terms of use to send your details.',
        }),
      );
    }
    if (dto.versionPolitique !== STAFF_CONSENT_VERSION) {
      throw new BadRequestException(
        pick({
          fr: 'Les conditions d’usage ont changé : rechargez la page et relisez-les.',
          en: 'The terms of use have changed: reload the page and read them again.',
        }),
      );
    }
    if (!photo) {
      throw new BadRequestException(
        pick({
          fr: 'La photo est obligatoire : ajoutez un portrait de vous, visage bien visible.',
          en: 'A photo is required: add a portrait of yourself, with your face clearly visible.',
        }),
      );
    }
    const telephone = dto.telephone.trim();
    const key = phoneKey(telephone);
    if (!key) {
      throw new BadRequestException(
        pick({
          fr: 'Le téléphone doit avoir 8 chiffres au moins.',
          en: 'The phone number must have at least 8 digits.',
        }),
      );
    }
    const urgenceTelephone = dto.urgenceTelephone?.trim() || null;
    if (urgenceTelephone && !phoneKey(urgenceTelephone)) {
      throw new BadRequestException(
        pick({
          fr: 'Le téléphone de la personne à prévenir doit avoir 8 chiffres au moins.',
          en: 'The emergency contact’s phone number must have at least 8 digits.',
        }),
      );
    }
    // Les classes : toutes de l'année active ; leur cycle dit si l'on demande aussi les matières (collège et lycée).
    const classIds = [...new Set(dto.classes)];
    const declared = await this.prisma.class.findMany({
      where: {
        id: { in: classIds },
        academicYear: {
          schoolId: await this.school.getDefaultId(),
          statut: 'ACTIVE',
        },
      },
      select: { id: true, ...CLASS_WITH_LEVEL },
    });
    if (declared.length !== classIds.length) {
      throw new BadRequestException(
        pick({ fr: 'Classe inconnue.', en: 'Unknown class.' }),
      );
    }
    const secondary = declared.some((c) =>
      isSecondaryCycle(c.level.cycle.code),
    );
    // Maternelle et primaire : l'enseignant est titulaire de sa classe, aucune matière n'est retenue.
    const subjectIds = secondary ? [...new Set(dto.matieres ?? [])] : [];
    if (secondary && subjectIds.length === 0) {
      throw new BadRequestException(
        pick({
          fr: 'Indiquez au moins une matière que vous enseignez au collège ou au lycée.',
          en: 'Select at least one subject you teach in middle or high school.',
        }),
      );
    }
    if (subjectIds.length > 0) {
      const found = await this.prisma.subject.count({
        where: { id: { in: subjectIds }, actif: true },
      });
      if (found !== subjectIds.length) {
        throw new BadRequestException(
          pick({ fr: 'Matière inconnue.', en: 'Unknown subject.' }),
        );
      }
    }
    // Une demande déjà en attente pour le même numéro : inutile d'en empiler une seconde.
    const waiting = await this.prisma.teacherSubmission.findFirst({
      where: { statut: 'EN_ATTENTE', telephoneCle: key },
      select: { id: true },
    });
    if (waiting) {
      throw new ConflictException(
        pick({
          fr: 'Une demande est déjà en attente pour ce numéro. Le secrétariat va la traiter.',
          en: 'A request is already waiting for this number. The school office will process it.',
        }),
      );
    }

    const schoolId = await this.school.getDefaultId();
    const motDePasseHash = await argon2.hash(dto.motDePasse, {
      type: argon2.argon2id,
    });
    const photoFichier = await storeTeacherPhoto(photo);
    try {
      const created = await this.prisma.teacherSubmission.create({
        data: {
          schoolId,
          linkId: link.id,
          nom: dto.nom.trim(),
          prenom: dto.prenom.trim(),
          telephone,
          telephoneCle: key,
          email: dto.email?.trim() || null,
          urgenceNom: dto.urgenceNom?.trim() || null,
          urgenceTelephone,
          photoFichier,
          matieres: subjectIds,
          classes: { create: classIds.map((classId) => ({ classId })) },
          motDePasseHash,
          consentementVersion: dto.versionPolitique,
        },
        select: { id: true },
      });
      // Jamais de nom, de numéro ni de mot de passe dans le journal : seulement des identifiants et des indicateurs.
      await this.audit.log({
        schoolId,
        userId: null,
        action: 'TEACHER_ONBOARDING_SUBMIT',
        entite: 'TeacherSubmission',
        entiteId: created.id,
        nouvelleValeur: {
          classes: classIds.length,
          secondaire: secondary,
          matieres: subjectIds.length,
          photo: true,
          email: !!dto.email,
        },
      });
    } catch (err) {
      await removeTeacherPhoto(photoFichier);
      throw err;
    }
    return { recu: true };
  }

  // ----------------------------------------------------------------------------------------------- personnel

  /** Toutes les classes (de n'importe quelle année : une demande peut être traitée après un changement d'année). */
  private async classViews() {
    const rows = await this.prisma.class.findMany({
      select: { id: true, nom: true, ...CLASS_WITH_LEVEL },
    });
    return new Map(rows.sort(byStructure).map((c) => [c.id, toClassView(c)]));
  }

  private async subjectNames() {
    const subjects = await this.prisma.subject.findMany({
      select: { id: true, nom: true },
    });
    return new Map(subjects.map((s) => [s.id, s.nom]));
  }

  async list(query: ListTeacherSubmissionsQueryDto) {
    const schoolId = await this.school.getDefaultId();
    const rows = await this.prisma.teacherSubmission.findMany({
      where: {
        schoolId,
        statut:
          query.statut === 'TRAITEES'
            ? { not: 'EN_ATTENTE' }
            : query.statut === 'EN_ATTENTE'
              ? 'EN_ATTENTE'
              : undefined,
      },
      orderBy: { createdAt: query.statut === 'TRAITEES' ? 'desc' : 'asc' },
      take: 200,
      include: { classes: { select: { classId: true } } },
    });
    const [names, classes] = await Promise.all([
      this.subjectNames(),
      this.classViews(),
    ]);
    return rows.map((r) => this.view(r, names, classes));
  }

  private view(
    r: {
      id: string;
      nom: string;
      prenom: string;
      telephone: string;
      email: string | null;
      urgenceNom: string | null;
      urgenceTelephone: string | null;
      photoFichier: string | null;
      matieres: string[];
      classes: Array<{ classId: string }>;
      statut: string;
      motifRefus: string | null;
      teacherId: string | null;
      createdAt: Date;
      traiteLe: Date | null;
    },
    names: Map<string, string>,
    classes: Map<string, TeacherClassView>,
  ) {
    return {
      id: r.id,
      nom: r.nom,
      prenom: r.prenom,
      telephone: r.telephone,
      email: r.email,
      urgenceNom: r.urgenceNom,
      urgenceTelephone: r.urgenceTelephone,
      photo: !!r.photoFichier,
      // Dans l'ordre de la structure scolaire (Primaire avant Collège), pas dans l'ordre où elles ont été cochées.
      classes: [...classes.values()].filter((c) =>
        r.classes.some((rc) => rc.classId === c.id),
      ),
      matieres: r.matieres
        .map((id) => ({ id, nom: names.get(id) ?? '' }))
        .filter((m) => m.nom),
      statut: r.statut,
      motifRefus: r.motifRefus,
      teacherId: r.teacherId,
      createdAt: r.createdAt,
      traiteLe: r.traiteLe,
    };
  }

  /** Suivi des fiches : qui a un compte, qui a un numéro, qui a une demande à valider (jamais les valeurs elles-mêmes). */
  async teachersStatus() {
    const schoolId = await this.school.getDefaultId();
    const [teachers, pending] = await Promise.all([
      this.prisma.teacher.findMany({
        where: { schoolId },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        select: {
          id: true,
          nom: true,
          prenom: true,
          statut: true,
          telephone: true,
          userId: true,
          photoFichier: true,
        },
      }),
      this.prisma.teacherSubmission.findMany({
        where: { schoolId, statut: 'EN_ATTENTE' },
        select: { nom: true, prenom: true },
      }),
    ]);
    return teachers.map((t) => ({
      id: t.id,
      nom: t.nom,
      prenom: t.prenom,
      statut: t.statut,
      aTelephone: !!t.telephone,
      aCompte: !!t.userId,
      aPhoto: !!t.photoFichier,
      demandeEnAttente: pending.some((p) => matchNames(p, t) === 'EXACT'),
    }));
  }

  private async submissionOrThrow(id: string) {
    const schoolId = await this.school.getDefaultId();
    const sub = await this.prisma.teacherSubmission.findFirst({
      where: { id, schoolId },
      include: { classes: { select: { classId: true } } },
    });
    if (!sub) {
      throw new NotFoundException('Demande introuvable.');
    }
    return sub;
  }

  async submissionPhoto(id: string) {
    const sub = await this.submissionOrThrow(id);
    return this.photoFile(sub.photoFichier);
  }

  async teacherPhoto(teacherId: string) {
    const schoolId = await this.school.getDefaultId();
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { photoFichier: true },
    });
    if (!teacher) throw new NotFoundException('Enseignant introuvable.');
    return this.photoFile(teacher.photoFichier);
  }

  private photoFile(filename: string | null) {
    if (!filename || !existsSync(teacherPhotoPath(filename))) {
      throw new NotFoundException('Aucune photo.');
    }
    return { path: teacherPhotoPath(filename), contentType: 'image/jpeg' };
  }

  // ---------------------------------------------------------------------------------------------- analyse

  /** Fiches dont le nom ressemble à celui tapé, les plus sûres d'abord. */
  private async candidates(sub: { nom: string; prenom: string }) {
    const schoolId = await this.school.getDefaultId();
    const teachers = await this.prisma.teacher.findMany({
      where: { schoolId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        statut: true,
        telephone: true,
        email: true,
        userId: true,
        photoFichier: true,
        modePointage: true,
      },
    });
    const order = { EXACT: 0, PROBABLE: 1, ORTHOGRAPHE: 2, AUCUN: 3 } as const;
    return teachers
      .map((t) => ({ ...t, correspondance: matchNames(sub, t) }))
      .filter((t) => t.correspondance !== 'AUCUN')
      .sort((a, b) => order[a.correspondance] - order[b.correspondance])
      .slice(0, 8);
  }

  private async computeAlerts(
    sub: {
      id: string;
      nom: string;
      prenom: string;
      telephoneCle: string;
      telephone: string;
      email: string | null;
      photoFichier: string | null;
    },
    teacher: {
      id: string;
      statut: string;
      telephone: string | null;
      email: string | null;
      userId: string | null;
      photoFichier: string | null;
    } | null,
    found: Array<{ correspondance: string; id: string }>,
  ): Promise<TeacherAlert[]> {
    const alerts: TeacherAlert[] = [];
    const schoolId = await this.school.getDefaultId();
    const phoneOwner = await this.prisma.user.findFirst({
      where: { schoolId, telephoneCle: sub.telephoneCle },
      select: { id: true },
    });
    if (phoneOwner) {
      alerts.push({
        code: 'TELEPHONE_DEJA_UTILISE',
        gravite: 'BLOQUANT',
        message:
          'Ce numéro est déjà celui d’un compte : la personne peut déjà se connecter. Refusez la demande.',
      });
    }
    if (sub.email) {
      const emailOwner = await this.prisma.user.findFirst({
        where: { schoolId, email: sub.email },
        select: { id: true },
      });
      if (emailOwner) {
        alerts.push({
          code: 'EMAIL_DEJA_UTILISE',
          gravite: 'CONFIRMATION',
          message:
            'Cet e-mail est déjà celui d’un autre compte : le compte sera créé avec le seul numéro de téléphone.',
        });
      }
    }
    if (!teacher) {
      alerts.push({
        code: 'NOUVELLE_FICHE',
        gravite: 'INFO',
        message: 'Une nouvelle fiche enseignant sera créée.',
      });
      if (found.some((f) => ['EXACT', 'PROBABLE'].includes(f.correspondance))) {
        alerts.push({
          code: 'FICHE_PROCHE_EXISTE',
          gravite: 'CONFIRMATION',
          message:
            'Une fiche au nom très proche existe déjà : vérifiez qu’il ne s’agit pas de la même personne avant d’en créer une nouvelle.',
        });
      }
      return alerts;
    }
    if (teacher.userId) {
      alerts.push({
        code: 'FICHE_DEJA_RELIEE',
        gravite: 'BLOQUANT',
        message:
          'Cette fiche est déjà reliée à un compte : choisissez une autre fiche ou refusez la demande.',
      });
    }
    if (teacher.statut !== 'ACTIF') {
      alerts.push({
        code: 'FICHE_INACTIVE',
        gravite: 'BLOQUANT',
        message:
          'Cette fiche est inactive : réactivez-la d’abord (Vie scolaire, Enseignants).',
      });
    }
    if (teacher.telephone && phoneKey(teacher.telephone) !== sub.telephoneCle) {
      alerts.push({
        code: 'TELEPHONE_FICHE_DIFFERENT',
        gravite: 'CONFIRMATION',
        message:
          'Le numéro de la fiche est différent de celui envoyé : le numéro envoyé le remplacera.',
      });
    }
    if (
      teacher.email &&
      sub.email &&
      teacher.email.toLowerCase() !== sub.email.toLowerCase()
    ) {
      alerts.push({
        code: 'EMAIL_FICHE_DIFFERENT',
        gravite: 'CONFIRMATION',
        message:
          'L’e-mail de la fiche est différent de celui envoyé : l’e-mail envoyé le remplacera.',
      });
    }
    if (teacher.photoFichier && sub.photoFichier) {
      alerts.push({
        code: 'PHOTO_DIFFERENTE',
        gravite: 'CONFIRMATION',
        message: 'La fiche a déjà une photo : la photo envoyée la remplacera.',
      });
    }
    return alerts;
  }

  async analyse(id: string, teacherId?: string) {
    const sub = await this.submissionOrThrow(id);
    const candidats = await this.candidates(sub);
    const exact = candidats.filter((c) => c.correspondance === 'EXACT');
    const proposeId =
      teacherId ?? (exact.length === 1 ? exact[0].id : undefined);
    let teacher: Teacher | null = null;
    if (proposeId) {
      const schoolId = await this.school.getDefaultId();
      teacher = await this.prisma.teacher.findFirst({
        where: { id: proposeId, schoolId },
      });
      if (!teacher) throw new NotFoundException('Enseignant introuvable.');
    }
    const alertes = await this.computeAlerts(sub, teacher, candidats);
    const [names, classes] = await Promise.all([
      this.subjectNames(),
      this.classViews(),
    ]);
    return {
      demande: this.view(sub, names, classes),
      candidats: candidats.map((c) => ({
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        statut: c.statut,
        telephone: c.telephone,
        email: c.email,
        aCompte: !!c.userId,
        aPhoto: !!c.photoFichier,
        modePointage: c.modePointage,
        correspondance: c.correspondance,
      })),
      propose: proposeId ?? null,
      alertes,
    };
  }

  // -------------------------------------------------------------------------------------------- validation

  async validate(
    id: string,
    dto: ValidateTeacherSubmissionDto,
    actor: CurrentUserData,
  ) {
    const sub = await this.submissionOrThrow(id);
    if (sub.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cette demande est déjà traitée.');
    }
    if (!!dto.teacherId === !!dto.creerFiche) {
      throw new BadRequestException(
        'Choisissez une fiche existante, ou demandez la création d’une nouvelle fiche.',
      );
    }
    if (!sub.motDePasseHash) {
      throw new ConflictException(
        'Le mot de passe de cette demande n’est plus disponible : refusez-la et demandez à l’enseignant de la renvoyer.',
      );
    }
    const schoolId = await this.school.getDefaultId();
    const role = await this.prisma.role.findUnique({
      where: { code: TEACHER_ROLE_CODE },
      select: {
        id: true,
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) {
      throw new ConflictException('Le rôle Enseignant est introuvable.');
    }
    // Le rôle ENSEIGNANT ne porte aucun droit réservé ; s'il en recevait un, seul un compte qui le détient peut valider.
    assertCanHandleReserved(
      actor.permissions,
      role.rolePermissions.map((rp) => rp.permission.code),
      'valider cette demande',
    );

    let teacher: Teacher | null = null;
    if (dto.teacherId) {
      teacher = await this.prisma.teacher.findFirst({
        where: { id: dto.teacherId, schoolId },
      });
      if (!teacher) throw new NotFoundException('Enseignant introuvable.');
    }
    const candidats = await this.candidates(sub);
    const alerts = await this.computeAlerts(sub, teacher, candidats);
    const blocking = alerts.find((a) => a.gravite === 'BLOQUANT');
    if (blocking) throw new ConflictException(blocking.message);
    const toConfirm = alerts.filter((a) => a.gravite === 'CONFIRMATION');
    if (toConfirm.length > 0 && !dto.confirmer) {
      throw new ConflictException({
        message: `Confirmation requise : ${toConfirm.map((a) => a.message).join(' ')}`,
        alertes: toConfirm,
      });
    }
    const emailTaken = alerts.some((a) => a.code === 'EMAIL_DEJA_UTILISE');
    const oldPhoto = teacher?.photoFichier ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.teacherSubmission.updateMany({
        where: { id: sub.id, statut: 'EN_ATTENTE' },
        data: {
          statut: 'VALIDEE',
          traiteParId: actor.id,
          traiteLe: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Cette demande est déjà traitée.');
      }
      const fiche = {
        telephone: sub.telephone,
        email: sub.email ?? teacher?.email ?? null,
        urgenceNom: sub.urgenceNom ?? teacher?.urgenceNom ?? null,
        urgenceTelephone:
          sub.urgenceTelephone ?? teacher?.urgenceTelephone ?? null,
        photoFichier: sub.photoFichier ?? teacher?.photoFichier ?? null,
        modePointage: dto.modePointage ?? teacher?.modePointage ?? 'SEANCE',
      };
      const target = teacher
        ? await tx.teacher.update({ where: { id: teacher.id }, data: fiche })
        : await tx.teacher.create({
            data: {
              schoolId,
              nom: sub.nom,
              prenom: sub.prenom,
              ...fiche,
            },
          });
      const user = await tx.user.create({
        data: {
          schoolId,
          roleId: role.id,
          nom: target.nom,
          prenom: target.prenom,
          email: emailTaken ? null : sub.email,
          telephone: sub.telephone,
          telephoneCle: sub.telephoneCle,
          // L'empreinte choisie par l'enseignant : personne ne connaît son mot de passe, il n'a rien à changer.
          motDePasseHash: sub.motDePasseHash as string,
          doitChangerMotDePasse: false,
        },
        select: { id: true },
      });
      await tx.teacher.update({
        where: { id: target.id },
        data: { userId: user.id },
      });
      // Matières déclarées : on ajoute celles qui manquent, sans jamais en retirer (indication seulement).
      const known = await tx.teacherSubject.findMany({
        where: { teacherId: target.id },
        select: { subjectId: true },
      });
      const have = new Set(known.map((k) => k.subjectId));
      const toAdd = sub.matieres.filter((m) => !have.has(m));
      if (toAdd.length > 0) {
        await tx.teacherSubject.createMany({
          data: toAdd.map((subjectId) => ({
            teacherId: target.id,
            subjectId,
          })),
        });
      }
      await tx.teacherSubmission.update({
        where: { id: sub.id },
        data: {
          teacherId: target.id,
          userId: user.id,
          motDePasseHash: null,
        },
      });
      return { teacherId: target.id, userId: user.id };
    });

    if (oldPhoto && sub.photoFichier && oldPhoto !== sub.photoFichier) {
      await removeTeacherPhoto(oldPhoto);
    }
    await this.audit.log({
      schoolId,
      userId: actor.id,
      action: 'TEACHER_ONBOARDING_VALIDATE',
      entite: 'TeacherSubmission',
      entiteId: sub.id,
      nouvelleValeur: {
        teacherId: result.teacherId,
        userId: result.userId,
        creerFiche: !!dto.creerFiche,
        modePointage: dto.modePointage ?? null,
        confirmations: toConfirm.map((a) => a.code),
      },
    });
    return result;
  }

  async refuse(id: string, motif: string, userId: string) {
    const sub = await this.submissionOrThrow(id);
    const schoolId = await this.school.getDefaultId();
    const claimed = await this.prisma.teacherSubmission.updateMany({
      where: { id: sub.id, statut: 'EN_ATTENTE' },
      data: {
        statut: 'REFUSEE',
        motifRefus: motif.trim(),
        motDePasseHash: null,
        photoFichier: null,
        traiteParId: userId,
        traiteLe: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('Cette demande est déjà traitée.');
    }
    await removeTeacherPhoto(sub.photoFichier);
    await this.audit.log({
      schoolId,
      userId,
      action: 'TEACHER_ONBOARDING_REFUSE',
      entite: 'TeacherSubmission',
      entiteId: sub.id,
      nouvelleValeur: { motif: motif.trim() },
    });
    return { id: sub.id };
  }
}
