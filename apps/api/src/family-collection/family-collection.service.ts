import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { pick } from '../common/language';
import { CONSENT_VERSION } from '../parent-portal/parent-auth.util';
import {
  matchNames,
  nameTokens,
  samePhoneNumber,
  sameText,
  type NameMatch,
} from './family-matching.util';
import type {
  ListFamilySubmissionsQueryDto,
  SubmitFamilyDto,
  UpdateCollectLinkDto,
  ValidateFamilyChildDto,
} from './dto/family-collection.dto';

/** Élève de l'année active dans une classe, avec ses responsables et l'état de leur compte. */
const STUDENT_WITH_GUARDIANS = {
  studentGuardians: {
    include: {
      guardian: {
        include: { parentAccount: { select: { statut: true } } },
      },
    },
  },
} satisfies Prisma.StudentInclude;
type StudentCtx = Prisma.StudentGetPayload<{
  include: typeof STUDENT_WITH_GUARDIANS;
}>;

const GUARDIAN_CTX = {
  studentGuardians: { select: { studentId: true } },
  parentAccount: { select: { statut: true } },
} satisfies Prisma.GuardianInclude;
type GuardianCtx = Prisma.GuardianGetPayload<{ include: typeof GUARDIAN_CTX }>;

const CURRENT_ENROLLMENT = {
  statut: 'ACTIVE' as const,
  academicYear: { statut: 'ACTIVE' as const },
};

type SubmissionRow = Prisma.FamilySubmissionGetPayload<{
  include: {
    enfants: { include: { class: { select: { id: true; nom: true } } } };
  };
}>;
type ChildRow = SubmissionRow['enfants'][number];

export interface Alert {
  code: string;
  severite: 'info' | 'conflit';
  detail?: Record<string, unknown>;
}

export interface Change {
  cible: 'ELEVE' | 'RESPONSABLE' | 'LIEN' | 'COMPTE';
  champ: string;
  avant: string | null;
  apres: string | null;
  type: 'ajout' | 'remplacement';
}

interface Proposal {
  match: NameMatch | 'PLUSIEURS';
  student: StudentCtx | null;
  candidats: StudentCtx[];
}

const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
const norm = (v: string | null | undefined) => (v ?? '').trim() || null;
const fullName = (g: { nom: string | null; prenom: string | null }) =>
  [g.prenom, g.nom].filter(Boolean).join(' ') || '—';

/**
 * Collecte des informations des familles par lien de classe (D184 à D190). Le secrétariat poste le lien d'une classe dans
 * le groupe WhatsApp des parents ; chaque parent y saisit ses informations, celles de ses enfants et un mot de passe.
 * RIEN n'atteint les dossiers avant la validation du secrétariat, enfant par enfant : le serveur propose l'élève
 * correspondant (jamais affiché au parent), signale les conflits, et n'écrase ni ne duplique rien sans confirmation.
 * À la validation, le responsable est retrouvé par son téléphone (ou créé), rattaché à l'élève, et son compte parent est
 * créé actif avec le mot de passe choisi, sans code d'activation.
 */
@Injectable()
export class FamilyCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(
    userId: string | null,
    action: string,
    entite: string,
    entiteId: string,
    ancienne?: unknown,
    nouvelle?: unknown,
  ) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite,
      entiteId,
      ancienneValeur: ancienne,
      nouvelleValeur: nouvelle,
    });
  }

  // ------------------------------------------------------------------ Public

  private async activeLink(token: string) {
    const link = await this.prisma.classCollectLink.findUnique({
      where: { token },
      include: {
        class: { select: { id: true, nom: true, academicYear: true } },
      },
    });
    if (!link) {
      throw new NotFoundException(
        pick({
          fr: 'Ce lien n’existe pas. Vérifiez-le ou demandez-le au secrétariat.',
          en: 'This link does not exist. Check it or ask the school office.',
        }),
      );
    }
    if (
      !link.actif ||
      link.expiresAt < new Date() ||
      link.class.academicYear.statut !== 'ACTIVE'
    ) {
      throw new GoneException(
        pick({
          fr: 'Ce lien n’est plus actif. Contactez le secrétariat de l’école.',
          en: 'This link is no longer active. Contact the school office.',
        }),
      );
    }
    return link;
  }

  /** Ce que la page publique a besoin de savoir : la classe du lien, les autres classes, la version de la politique. */
  async publicInfo(token: string) {
    const link = await this.activeLink(token);
    const schoolId = await this.school.getDefaultId();
    const [school, classes] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { nom: true },
      }),
      this.prisma.class.findMany({
        where: { academicYear: { statut: 'ACTIVE' } },
        orderBy: { nom: 'asc' },
        select: {
          id: true,
          nom: true,
          level: {
            select: {
              cycle: { select: { section: { select: { nom: true } } } },
            },
          },
        },
      }),
    ]);
    return {
      ecole: school.nom,
      classe: { id: link.class.id, nom: link.class.nom },
      classes: classes.map((c) => ({
        id: c.id,
        nom: c.nom,
        section: c.level.cycle.section.nom,
      })),
      versionPolitique: CONSENT_VERSION,
    };
  }

  private parseBirthDate(value: string, label: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    const valid =
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
    if (!valid || date < new Date('1990-01-01T00:00:00.000Z')) {
      throw new BadRequestException(
        pick({
          fr: `${label} : la date de naissance est invalide.`,
          en: `${label}: the date of birth is invalid.`,
        }),
      );
    }
    if (date > new Date()) {
      throw new BadRequestException(
        pick({
          fr: `${label} : la date de naissance ne peut pas être dans le futur.`,
          en: `${label}: the date of birth cannot be in the future.`,
        }),
      );
    }
    return date;
  }

  async submit(token: string, dto: SubmitFamilyDto) {
    const link = await this.activeLink(token);
    if (!dto.consentement) {
      throw new BadRequestException(
        pick({
          fr: 'Vous devez accepter la politique de confidentialité pour envoyer vos informations.',
          en: 'You must accept the privacy policy to send your details.',
        }),
      );
    }
    if (dto.versionPolitique !== CONSENT_VERSION) {
      throw new BadRequestException(
        pick({
          fr: 'La politique de confidentialité a changé : rechargez la page et relisez-la.',
          en: 'The privacy policy has changed: reload the page and read it again.',
        }),
      );
    }
    const label = (i: number) =>
      `${dto.enfants[i].prenom.trim()} ${dto.enfants[i].nom.trim()}`;
    const births = dto.enfants.map((e, i) =>
      this.parseBirthDate(e.dateNaissance, label(i)),
    );

    const classIds = [
      ...new Set(dto.enfants.map((e) => e.classId || link.classId)),
    ];
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds }, academicYear: { statut: 'ACTIVE' } },
      select: { id: true, nom: true },
    });
    const className = new Map(classes.map((c) => [c.id, c.nom]));
    for (const id of classIds) {
      if (!className.has(id)) {
        throw new BadRequestException(
          pick({ fr: 'Classe inconnue.', en: 'Unknown class.' }),
        );
      }
    }
    const sameChild = (
      a: { nom: string; prenom: string },
      b: { nom: string; prenom: string },
    ) => {
      const x = [...nameTokens(a.nom, a.prenom)].sort().join(' ');
      const y = [...nameTokens(b.nom, b.prenom)].sort().join(' ');
      return x === y;
    };
    dto.enfants.forEach((e, i) => {
      dto.enfants.slice(0, i).forEach((other) => {
        if (
          (other.classId || link.classId) === (e.classId || link.classId) &&
          sameChild(e, other)
        ) {
          throw new BadRequestException(
            pick({
              fr: `${label(i)} apparaît deux fois dans votre envoi.`,
              en: `${label(i)} appears twice in your submission.`,
            }),
          );
        }
      });
    });

    // Une demande déjà en attente pour le même enfant et le même numéro : inutile d'en empiler une seconde.
    const waiting = await this.prisma.familySubmissionChild.findMany({
      where: { statut: 'EN_ATTENTE', classId: { in: classIds } },
      select: {
        nom: true,
        prenom: true,
        classId: true,
        submission: { select: { telephone: true } },
      },
    });
    dto.enfants.forEach((e, i) => {
      const cid = e.classId || link.classId;
      const dup = waiting.some(
        (w) =>
          w.classId === cid &&
          sameChild(w, e) &&
          samePhoneNumber(w.submission.telephone, dto.responsable.telephone),
      );
      if (dup) {
        throw new ConflictException(
          pick({
            fr: `Une demande est déjà en attente pour ${label(i)}. Le secrétariat va la traiter.`,
            en: `A request is already waiting for ${label(i)}. The school office will process it.`,
          }),
        );
      }
    });

    const schoolId = await this.school.getDefaultId();
    const motDePasseHash = await argon2.hash(dto.motDePasse, {
      type: argon2.argon2id,
    });
    const r = dto.responsable;
    const submission = await this.prisma.familySubmission.create({
      data: {
        schoolId,
        linkId: link.id,
        nom: r.nom.trim(),
        prenom: r.prenom.trim(),
        telephone: r.telephone.trim(),
        email: norm(r.email),
        profession: norm(r.profession),
        adresse: norm(r.adresse),
        lien: r.lien ?? null,
        motDePasseHash,
        consentementVersion: dto.versionPolitique,
        enfants: {
          create: dto.enfants.map((e, i) => ({
            ordre: i,
            classId: e.classId || link.classId,
            nom: e.nom.trim(),
            prenom: e.prenom.trim(),
            dateNaissance: births[i],
            lieuNaissance: norm(e.lieuNaissance),
          })),
        },
      },
    });
    // Ni le mot de passe ni les coordonnées dans le journal : le lien, la classe et le nombre d'enfants suffisent.
    await this.log(
      null,
      'FAMILY_COLLECTION_SUBMIT',
      'FamilySubmission',
      submission.id,
      null,
      { classId: link.classId, enfants: dto.enfants.length },
    );
    return {
      recu: true,
      enfants: dto.enfants.map((e, i) => ({
        prenom: e.prenom.trim(),
        nom: e.nom.trim(),
        classe: className.get(e.classId || link.classId) as string,
        ordre: i,
      })),
    };
  }

  // --------------------------------------------------------------- Liens de classe

  private newToken() {
    return randomBytes(24).toString('base64url');
  }

  private async linkExpiry() {
    const s = await this.prisma.school.findFirstOrThrow({
      select: { parentCodeValiditeJours: true },
    });
    return new Date(Date.now() + s.parentCodeValiditeJours * 86_400_000);
  }

  private linkView(
    link: { token: string; actif: boolean; expiresAt: Date } | null,
  ) {
    if (!link) return null;
    return {
      token: link.token,
      actif: link.actif,
      expireLe: link.expiresAt,
      expire: link.expiresAt < new Date(),
    };
  }

  private async activeYearClass(classId: string) {
    const klass = await this.prisma.class.findFirst({
      where: { id: classId, academicYear: { statut: 'ACTIVE' } },
      select: { id: true, nom: true },
    });
    if (!klass) {
      throw new NotFoundException(
        'Classe introuvable dans l’année scolaire active.',
      );
    }
    return klass;
  }

  /** Crée le lien d'une classe, ou le renvoie s'il existe ; `regenerer` le remplace (l'ancien cesse de fonctionner). */
  async createLink(classId: string, regenerer: boolean, userId: string) {
    await this.activeYearClass(classId);
    const existing = await this.prisma.classCollectLink.findUnique({
      where: { classId },
    });
    if (existing && !regenerer) return this.linkView(existing);
    const expiresAt = await this.linkExpiry();
    const link = existing
      ? await this.prisma.classCollectLink.update({
          where: { classId },
          data: { token: this.newToken(), actif: true, expiresAt },
        })
      : await this.prisma.classCollectLink.create({
          data: {
            classId,
            token: this.newToken(),
            expiresAt,
            createdById: userId,
          },
        });
    await this.log(
      userId,
      existing ? 'FAMILY_LINK_REGENERATE' : 'FAMILY_LINK_CREATE',
      'ClassCollectLink',
      link.id,
      null,
      { classId, expireLe: expiresAt },
    ); // jamais le jeton
    return this.linkView(link);
  }

  async createAllLinks(userId: string) {
    const classes = await this.prisma.class.findMany({
      where: { academicYear: { statut: 'ACTIVE' }, collectLink: null },
      select: { id: true },
    });
    for (const c of classes) await this.createLink(c.id, false, userId);
    return { crees: classes.length };
  }

  async updateLink(classId: string, dto: UpdateCollectLinkDto, userId: string) {
    await this.activeYearClass(classId);
    const link = await this.prisma.classCollectLink.findUnique({
      where: { classId },
    });
    if (!link)
      throw new NotFoundException('Cette classe n’a pas encore de lien.');
    const data: Prisma.ClassCollectLinkUpdateInput = {};
    if (dto.actif !== undefined) data.actif = dto.actif;
    if (dto.prolonger) {
      data.expiresAt = await this.linkExpiry();
      if (dto.actif === undefined) data.actif = true;
    }
    const updated = await this.prisma.classCollectLink.update({
      where: { classId },
      data,
    });
    await this.log(
      userId,
      dto.prolonger
        ? 'FAMILY_LINK_EXTEND'
        : dto.actif
          ? 'FAMILY_LINK_REOPEN'
          : 'FAMILY_LINK_CLOSE',
      'ClassCollectLink',
      link.id,
      { actif: link.actif, expireLe: link.expiresAt },
      { actif: updated.actif, expireLe: updated.expiresAt },
    );
    return this.linkView(updated);
  }

  // ---------------------------------------------------------------- Suivi par classe

  private completeness(s: {
    dateNaissance: Date | null;
    studentGuardians: Array<{
      guardian: {
        telephone: string | null;
        parentAccount: { statut: string } | null;
      };
    }>;
  }) {
    const withPhone = s.studentGuardians.filter((l) => l.guardian.telephone);
    return {
      date: s.dateNaissance !== null,
      responsable: withPhone.length > 0,
      compte: withPhone.some(
        (l) => l.guardian.parentAccount?.statut === 'ACTIF',
      )
        ? ('ACTIF' as const)
        : null,
    };
  }

  /** Avancement de chaque classe de l'année active : où en sont les informations, et le lien. */
  async classes() {
    const classes = await this.prisma.class.findMany({
      where: { academicYear: { statut: 'ACTIVE' } },
      include: {
        level: { include: { cycle: { include: { section: true } } } },
        collectLink: true,
        enrollments: {
          where: { statut: 'ACTIVE' },
          select: {
            student: {
              select: {
                dateNaissance: true,
                studentGuardians: {
                  select: {
                    guardian: {
                      select: {
                        telephone: true,
                        parentAccount: { select: { statut: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const waiting = await this.prisma.familySubmissionChild.groupBy({
      by: ['classId'],
      where: { statut: 'EN_ATTENTE' },
      _count: { _all: true },
    });
    const waitingBy = new Map(waiting.map((w) => [w.classId, w._count._all]));
    return classes
      .map((c) => {
        const states = c.enrollments.map((e) => this.completeness(e.student));
        return {
          classId: c.id,
          classe: c.nom,
          section: c.level.cycle.section.nom,
          effectif: states.length,
          complets: states.filter((s) => s.date && s.responsable).length,
          sansDate: states.filter((s) => !s.date).length,
          sansResponsable: states.filter((s) => !s.responsable).length,
          comptesActifs: states.filter((s) => s.compte === 'ACTIF').length,
          enAttente: waitingBy.get(c.id) ?? 0,
          lien: this.linkView(c.collectLink),
        };
      })
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section, 'fr') ||
          a.classe.localeCompare(b.classe, 'fr'),
      );
  }

  /** Les élèves de la classe avec ce qui leur manque : sert à relancer les retardataires et à choisir un élève à la main. */
  async classDetail(classId: string) {
    const klass = await this.activeYearClass(classId);
    const students = await this.prisma.student.findMany({
      where: { enrollments: { some: { ...CURRENT_ENROLLMENT, classId } } },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      include: STUDENT_WITH_GUARDIANS,
    });
    const link = await this.prisma.classCollectLink.findUnique({
      where: { classId },
    });
    return {
      classe: klass,
      lien: this.linkView(link),
      eleves: students.map((s) => {
        const c = this.completeness(s);
        return {
          id: s.id,
          nom: s.nom,
          prenom: s.prenom,
          matricule: s.matricule,
          dateNaissance: c.date,
          responsable: c.responsable,
          compte: c.compte,
        };
      }),
    };
  }

  // ---------------------------------------------------------- File de validation

  private async roster(classId: string): Promise<StudentCtx[]> {
    return this.prisma.student.findMany({
      where: {
        statut: 'ACTIF',
        enrollments: { some: { ...CURRENT_ENROLLMENT, classId } },
      },
      include: STUDENT_WITH_GUARDIANS,
    });
  }

  private async allGuardians(): Promise<GuardianCtx[]> {
    return this.prisma.guardian.findMany({
      where: { telephone: { not: null } },
      include: GUARDIAN_CTX,
    });
  }

  private propose(
    child: { nom: string; prenom: string },
    roster: StudentCtx[],
  ): Proposal {
    const scored = roster
      .map((s) => ({ s, m: matchNames(child, s) }))
      .filter((x) => x.m !== 'AUCUN');
    for (const level of ['EXACT', 'PROBABLE'] as const) {
      const hits = scored.filter((x) => x.m === level).map((x) => x.s);
      if (hits.length === 1) {
        return { match: level, student: hits[0], candidats: hits };
      }
      if (hits.length > 1) {
        return { match: 'PLUSIEURS', student: null, candidats: hits };
      }
    }
    return { match: 'AUCUN', student: null, candidats: [] };
  }

  /** Ce qui changerait dans les dossiers si on validait cet enfant pour cet élève, et ce qui mérite un regard. */
  private analyse(
    student: StudentCtx,
    child: ChildRow,
    sub: SubmissionRow,
    guardians: GuardianCtx[],
  ) {
    const alertes: Alert[] = [];
    const modifications: Change[] = [];

    const typedBirth = day(child.dateNaissance);
    const currentBirth = day(student.dateNaissance);
    if (!currentBirth) {
      modifications.push({
        cible: 'ELEVE',
        champ: 'dateNaissance',
        avant: null,
        apres: typedBirth,
        type: 'ajout',
      });
    } else if (currentBirth !== typedBirth) {
      alertes.push({
        code: 'DATE_DIFFERENTE',
        severite: 'conflit',
        detail: { avant: currentBirth, apres: typedBirth },
      });
      modifications.push({
        cible: 'ELEVE',
        champ: 'dateNaissance',
        avant: currentBirth,
        apres: typedBirth,
        type: 'remplacement',
      });
    }
    if (child.lieuNaissance) {
      if (!student.lieuNaissance) {
        modifications.push({
          cible: 'ELEVE',
          champ: 'lieuNaissance',
          avant: null,
          apres: child.lieuNaissance,
          type: 'ajout',
        });
      } else if (!sameText(student.lieuNaissance, child.lieuNaissance)) {
        alertes.push({
          code: 'LIEU_DIFFERENT',
          severite: 'conflit',
          detail: { avant: student.lieuNaissance, apres: child.lieuNaissance },
        });
        modifications.push({
          cible: 'ELEVE',
          champ: 'lieuNaissance',
          avant: student.lieuNaissance,
          apres: child.lieuNaissance,
          type: 'remplacement',
        });
      }
    }

    const existing = guardians.find((g) =>
      samePhoneNumber(g.telephone, sub.telephone),
    );
    const links = student.studentGuardians;
    const linked =
      !!existing && links.some((l) => l.guardianId === existing.id);
    if (!existing) {
      modifications.push({
        cible: 'RESPONSABLE',
        champ: 'nouveau responsable',
        avant: null,
        apres: `${fullName(sub)} (${sub.telephone})`,
        type: 'ajout',
      });
    } else {
      const fields: Array<
        ['nom' | 'prenom' | 'email' | 'profession' | 'adresse', string | null]
      > = [
        ['nom', sub.nom],
        ['prenom', sub.prenom],
        ['email', sub.email],
        ['profession', sub.profession],
        ['adresse', sub.adresse],
      ];
      for (const [champ, value] of fields) {
        if (!value) continue;
        const current = existing[champ];
        if (!current) {
          modifications.push({
            cible: 'RESPONSABLE',
            champ,
            avant: null,
            apres: value,
            type: 'ajout',
          });
        } else if (
          champ === 'email'
            ? current.toLowerCase() !== value.toLowerCase()
            : !sameText(current, value)
        ) {
          alertes.push({
            code: 'RESPONSABLE_DIFFERENT',
            severite: 'conflit',
            detail: { champ, avant: current, apres: value },
          });
          modifications.push({
            cible: 'RESPONSABLE',
            champ,
            avant: current,
            apres: value,
            type: 'remplacement',
          });
        }
      }
      if (!linked && existing.studentGuardians.length > 0) {
        alertes.push({
          code: 'NUMERO_DEJA_UTILISE',
          severite: 'info',
          detail: { eleves: existing.studentGuardians.length },
        });
      }
    }
    if (!linked) {
      modifications.push({
        cible: 'LIEN',
        champ: 'rattachement à l’élève',
        avant: null,
        apres: sub.lien ?? null,
        type: 'ajout',
      });
      const others = links.filter((l) => l.guardianId !== existing?.id);
      if (others.length > 0) {
        alertes.push({
          code: 'AUTRE_RESPONSABLE',
          severite: 'conflit',
          detail: {
            responsables: others.map((l) => ({
              nom: fullName(l.guardian),
              telephone: l.guardian.telephone,
            })),
          },
        });
      }
    }
    if (existing?.parentAccount) {
      alertes.push({
        code:
          existing.parentAccount.statut === 'ACTIF'
            ? 'COMPTE_EXISTANT'
            : 'COMPTE_DESACTIVE',
        severite: 'info',
      });
    } else {
      modifications.push({
        cible: 'COMPTE',
        champ: 'compte parent',
        avant: null,
        apres: 'créé et actif',
        type: 'ajout',
      });
    }
    return {
      alertes,
      modifications,
      conflit: alertes.some((a) => a.severite === 'conflit'),
    };
  }

  private describe(student: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
  }) {
    return {
      id: student.id,
      nom: student.nom,
      prenom: student.prenom,
      matricule: student.matricule,
    };
  }

  private childAnalysis(
    child: ChildRow,
    sub: SubmissionRow,
    roster: StudentCtx[],
    guardians: GuardianCtx[],
    chosen?: StudentCtx,
  ) {
    const proposal = this.propose(child, roster);
    const student = chosen ?? proposal.student;
    const detail = student
      ? this.analyse(student, child, sub, guardians)
      : {
          alertes: [] as Alert[],
          modifications: [] as Change[],
          conflit: false,
        };
    return {
      match: chosen ? ('CHOISI' as const) : proposal.match,
      etudiantPropose: student ? this.describe(student) : null,
      candidats: proposal.candidats.map((s) => this.describe(s)),
      alertes: detail.alertes,
      modifications: detail.modifications,
      // Validable en un clic : l'élève est sûr et rien d'existant n'est modifié ni doublé.
      simple: proposal.match === 'EXACT' && !chosen && !detail.conflit,
    };
  }

  private async views(subs: SubmissionRow[], withAnalysis: boolean) {
    const classIds = [
      ...new Set(
        subs.flatMap((s) =>
          s.enfants
            .filter((c) => c.statut === 'EN_ATTENTE')
            .map((c) => c.classId),
        ),
      ),
    ];
    const rosters = new Map<string, StudentCtx[]>();
    if (withAnalysis) {
      for (const id of classIds) rosters.set(id, await this.roster(id));
    }
    const guardians = withAnalysis ? await this.allGuardians() : [];
    const studentIds = [
      ...new Set(
        subs.flatMap((s) =>
          s.enfants.flatMap((c) => (c.studentId ? [c.studentId] : [])),
        ),
      ),
    ];
    const students = studentIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, nom: true, prenom: true, matricule: true },
        })
      : [];
    const byId = new Map(students.map((s) => [s.id, s]));
    return subs.map((s) => ({
      id: s.id,
      creeLe: s.createdAt,
      responsable: {
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        email: s.email,
        profession: s.profession,
        adresse: s.adresse,
        lien: s.lien,
      },
      enfants: s.enfants.map((c) => ({
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        dateNaissance: day(c.dateNaissance),
        lieuNaissance: c.lieuNaissance,
        classe: c.class,
        statut: c.statut,
        motifRefus: c.motifRefus,
        traiteLe: c.traiteLe,
        eleve: c.studentId ? (byId.get(c.studentId) ?? null) : null,
        analyse:
          withAnalysis && c.statut === 'EN_ATTENTE'
            ? this.childAnalysis(c, s, rosters.get(c.classId) ?? [], guardians)
            : null,
      })),
    }));
  }

  private readonly SUBMISSION_INCLUDE = {
    enfants: {
      orderBy: { ordre: 'asc' as const },
      include: { class: { select: { id: true, nom: true } } },
    },
  };

  async list(query: ListFamilySubmissionsQueryDto) {
    const pending = query.statut !== 'TRAITEES';
    const rows = await this.prisma.familySubmission.findMany({
      where: {
        AND: [
          pending
            ? { enfants: { some: { statut: 'EN_ATTENTE' } } }
            : { enfants: { none: { statut: 'EN_ATTENTE' } } },
          query.classId
            ? { enfants: { some: { classId: query.classId } } }
            : {},
        ],
      },
      orderBy: { createdAt: pending ? 'asc' : 'desc' },
      take: 200,
      include: this.SUBMISSION_INCLUDE,
    });
    return this.views(rows, pending);
  }

  private async loadChild(childId: string) {
    const child = await this.prisma.familySubmissionChild.findUnique({
      where: { id: childId },
      include: {
        class: { select: { id: true, nom: true } },
        submission: { include: this.SUBMISSION_INCLUDE },
      },
    });
    if (!child) throw new NotFoundException('Enfant introuvable.');
    return { child, sub: child.submission };
  }

  /** Aperçu de la validation pour un élève choisi à la main (avant/après et alertes). */
  async analyseChild(childId: string, studentId?: string) {
    const { child, sub } = await this.loadChild(childId);
    const roster = await this.roster(child.classId);
    const guardians = await this.allGuardians();
    let chosen: StudentCtx | undefined;
    if (studentId) {
      chosen =
        (await this.prisma.student.findFirst({
          where: { id: studentId, statut: 'ACTIF' },
          include: STUDENT_WITH_GUARDIANS,
        })) ?? undefined;
      if (!chosen) throw new NotFoundException('Élève introuvable.');
    }
    return this.childAnalysis(child, sub, roster, guardians, chosen);
  }

  // ----------------------------------------------------------------- Décisions

  async validate(childId: string, dto: ValidateFamilyChildDto, userId: string) {
    const { child, sub } = await this.loadChild(childId);
    if (child.statut !== 'EN_ATTENTE') {
      throw new ConflictException('Cet enfant a déjà été traité.');
    }
    const roster = await this.roster(child.classId);
    const guardians = await this.allGuardians();
    let student: StudentCtx | null = null;
    if (dto.studentId) {
      student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, statut: 'ACTIF' },
        include: STUDENT_WITH_GUARDIANS,
      });
      if (!student) throw new NotFoundException('Élève introuvable.');
    } else {
      student = this.propose(child, roster).student;
    }
    if (!student) {
      throw new UnprocessableEntityException(
        'Aucun élève ne correspond avec certitude : choisissez l’élève dans la liste de la classe.',
      );
    }
    const plan = this.analyse(student, child, sub, guardians);
    if (plan.conflit && !dto.confirmer) {
      throw new ConflictException({
        message:
          'Des valeurs déjà enregistrées diffèrent, ou l’élève a déjà un autre responsable : vérifiez puis confirmez.',
        alertes: plan.alertes,
        modifications: plan.modifications,
      });
    }
    const confirmer = dto.confirmer === true;
    const target = student;

    const result = await this.prisma
      .$transaction(async (tx) => {
        const claimed = await tx.familySubmissionChild.updateMany({
          where: { id: child.id, statut: 'EN_ATTENTE' },
          data: {
            statut: 'VALIDE',
            studentId: target.id,
            traiteParUserId: userId,
            traiteLe: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Cet enfant a déjà été traité.');
        }

        // Élève : on complète ce qui manque ; une valeur différente n'est remplacée que sur confirmation.
        const studentData: Prisma.StudentUpdateInput = {};
        if (!target.dateNaissance || confirmer) {
          studentData.dateNaissance = child.dateNaissance;
        }
        if (child.lieuNaissance && (!target.lieuNaissance || confirmer)) {
          studentData.lieuNaissance = child.lieuNaissance;
        }
        if (Object.keys(studentData).length > 0) {
          await tx.student.update({
            where: { id: target.id },
            data: studentData,
          });
        }

        // Responsable : retrouvé par son téléphone, sinon créé.
        const all = await tx.guardian.findMany({
          where: { telephone: { not: null } },
          include: { parentAccount: { select: { statut: true } } },
        });
        let guardian = all.find((g) =>
          samePhoneNumber(g.telephone, sub.telephone),
        );
        let created = false;
        if (!guardian) {
          const made = await tx.guardian.create({
            data: {
              schoolId: sub.schoolId,
              nom: sub.nom,
              prenom: sub.prenom,
              telephone: sub.telephone,
              email: sub.email,
              profession: sub.profession,
              adresse: sub.adresse,
            },
          });
          guardian = { ...made, parentAccount: null };
          created = true;
        } else {
          const data: Prisma.GuardianUpdateInput = {};
          const wanted = {
            nom: sub.nom,
            prenom: sub.prenom,
            email: sub.email,
            profession: sub.profession,
            adresse: sub.adresse,
          } as const;
          for (const key of Object.keys(wanted) as Array<keyof typeof wanted>) {
            const value = wanted[key];
            if (value && (!guardian[key] || confirmer)) data[key] = value;
          }
          if (Object.keys(data).length > 0) {
            await tx.guardian.update({ where: { id: guardian.id }, data });
          }
        }

        const link = await tx.studentGuardian.findUnique({
          where: {
            studentId_guardianId: {
              studentId: target.id,
              guardianId: guardian.id,
            },
          },
        });
        if (!link) {
          const count = await tx.studentGuardian.count({
            where: { studentId: target.id },
          });
          await tx.studentGuardian.create({
            data: {
              studentId: target.id,
              guardianId: guardian.id,
              lien: sub.lien,
              prioritaire: count === 0,
            },
          });
        } else if (!link.lien && sub.lien) {
          await tx.studentGuardian.update({
            where: { id: link.id },
            data: { lien: sub.lien },
          });
        }

        // Compte parent : créé actif avec le mot de passe choisi ; un compte existant n'est JAMAIS touché (sinon
        // soumettre le numéro d'un autre parent permettrait de changer son mot de passe).
        let accountCreated = false;
        if (!guardian.parentAccount && sub.motDePasseHash) {
          const account = await tx.parentAccount.create({
            data: {
              guardianId: guardian.id,
              motDePasseHash: sub.motDePasseHash,
              statut: 'ACTIF',
            },
          });
          await tx.parentConsent.create({
            data: { accountId: account.id, version: sub.consentementVersion },
          });
          accountCreated = true;
        }
        if (sub.motDePasseHash) {
          await tx.familySubmission.update({
            where: { id: sub.id },
            data: { motDePasseHash: null },
          });
        }
        return {
          guardianId: guardian.id,
          guardianCreated: created,
          accountCreated,
        };
      })
      .catch((e: unknown) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(
            'Un autre traitement a modifié ce responsable au même moment : réessayez.',
          );
        }
        throw e;
      });

    await this.log(
      userId,
      'FAMILY_COLLECTION_VALIDATE',
      'FamilySubmissionChild',
      child.id,
      null,
      {
        studentId: target.id,
        guardianId: result.guardianId,
        responsableCree: result.guardianCreated,
        compteCree: result.accountCreated,
        confirme: confirmer,
        modifications: plan.modifications,
      },
    );
    return (await this.views([await this.reload(sub.id)], false))[0];
  }

  private async reload(submissionId: string) {
    return this.prisma.familySubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: this.SUBMISSION_INCLUDE,
    });
  }

  async refuse(childId: string, motif: string, userId: string) {
    const { child, sub } = await this.loadChild(childId);
    const claimed = await this.prisma.familySubmissionChild.updateMany({
      where: { id: child.id, statut: 'EN_ATTENTE' },
      data: {
        statut: 'REFUSE',
        motifRefus: motif.trim(),
        traiteParUserId: userId,
        traiteLe: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Cet enfant a déjà été traité.');
    }
    // Plus aucun enfant à traiter et aucun compte créé : le mot de passe choisi n'a plus de raison d'être conservé.
    const remaining = await this.prisma.familySubmissionChild.count({
      where: { submissionId: sub.id, statut: 'EN_ATTENTE' },
    });
    if (remaining === 0) {
      await this.prisma.familySubmission.update({
        where: { id: sub.id },
        data: { motDePasseHash: null },
      });
    }
    await this.log(
      userId,
      'FAMILY_COLLECTION_REFUSE',
      'FamilySubmissionChild',
      child.id,
      null,
      {
        motif: motif.trim(),
      },
    );
    return (await this.views([await this.reload(sub.id)], false))[0];
  }

  /** Valide d'un coup tous les enfants « simples » d'une classe ; les autres restent à examiner un par un. */
  async validateSimple(classId: string, userId: string) {
    await this.activeYearClass(classId);
    const rows = await this.prisma.familySubmission.findMany({
      where: {
        enfants: { some: { statut: 'EN_ATTENTE', classId } },
      },
      orderBy: { createdAt: 'asc' },
      include: this.SUBMISSION_INCLUDE,
    });
    const roster = await this.roster(classId);
    const guardians = await this.allGuardians();
    let valides = 0;
    let aExaminer = 0;
    for (const sub of rows) {
      for (const child of sub.enfants) {
        if (child.statut !== 'EN_ATTENTE' || child.classId !== classId)
          continue;
        const analysis = this.childAnalysis(child, sub, roster, guardians);
        if (!analysis.simple) {
          aExaminer++;
          continue;
        }
        try {
          await this.validate(child.id, {}, userId);
          valides++;
        } catch {
          aExaminer++;
        }
      }
    }
    return { valides, aExaminer };
  }
}
