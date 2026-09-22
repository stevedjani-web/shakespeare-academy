import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { NumberSequenceService } from '../common/number-sequence.service';

/** Inscription qui donne droit à un document : active, dans l'année scolaire active. */
const CURRENT_ENROLLMENT = {
  statut: 'ACTIVE',
  academicYear: { statut: 'ACTIVE' },
} as const;

const PREFIX: Record<DocumentType, string> = {
  ATTESTATION_SCOLARITE: 'ATT',
  CARTE_ELEVE: 'CAR',
};

/** Cartes d'une classe en une fois : au-delà, on procède autrement (une classe dépasse rarement 60 élèves). */
export const CLASS_CARDS_MAX = 200;

export interface IssueActor {
  type: 'STAFF' | 'PARENT';
  id: string;
}

/** Contenu figé d'un document : ce que la réimpression restituera à l'identique. */
export interface DocumentSnapshot {
  eleve: {
    nom: string;
    prenom: string;
    sexe: 'M' | 'F';
    dateNaissance: string;
    lieuNaissance: string | null;
    matricule: string;
  };
  classe: string;
  annee: { libelle: string; debut: string; fin: string };
  ecole: {
    nom: string;
    adresse: string | null;
    telephone: string | null;
    logoUrl: string | null;
  };
  directeur: {
    nom: string | null;
    titre: string;
    ville: string | null;
    signatureUrl: string | null;
  };
  echeance: string;
}

type DocumentRow = Prisma.IssuedDocumentGetPayload<object>;
type SchoolRow = Awaited<ReturnType<SchoolService['getDefault']>>;
type StudentRow = Prisma.StudentGetPayload<object>;
type EnrollmentRow = Prisma.EnrollmentGetPayload<{
  include: { class: true; academicYear: true };
}>;

function toView(d: DocumentRow) {
  return {
    id: d.id,
    studentId: d.studentId,
    type: d.type,
    numero: d.numero,
    verificationToken: d.verificationToken,
    dateEmission: d.dateEmission,
    annuleLe: d.annuleLe,
    motifAnnulation: d.motifAnnulation,
    emisParType: d.emisParType,
    snapshot: d.snapshot as unknown as DocumentSnapshot,
  };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Documents officiels (Lot 19) : attestation de scolarité et carte d'élève. Le contenu est figé à l'émission, le numéro
 * est séquentiel, et le jeton du QR code est aléatoire (jamais le numéro). Émettre est idempotent : redemander le même
 * document renvoie l'existant sans consommer de numéro ; seul « renouveler » en crée un nouveau (et annule l'ancien).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolService: SchoolService,
    private readonly numbers: NumberSequenceService,
  ) {}

  async issue(
    studentId: string,
    type: DocumentType,
    actor: IssueActor,
    opts: { renouveler?: boolean } = {},
  ) {
    const school = await this.schoolService.getDefault();
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: school.id },
    });
    if (!student) throw new NotFoundException('Élève introuvable.');
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, ...CURRENT_ENROLLMENT },
      include: { class: true, academicYear: true },
      orderBy: { dateInscription: 'desc' },
    });
    return toView(
      await this.issueForEnrollment(
        school,
        student,
        enrollment,
        type,
        actor,
        opts.renouveler === true,
      ),
    );
  }

  private async issueForEnrollment(
    school: SchoolRow,
    student: StudentRow,
    enrollment: EnrollmentRow | null,
    type: DocumentType,
    actor: IssueActor,
    renouveler: boolean,
  ): Promise<DocumentRow> {
    if (student.statut !== 'ACTIF') {
      throw new UnprocessableEntityException(
        'Le dossier de cet élève est inactif : aucun document ne peut être émis.',
      );
    }
    if (!enrollment) {
      throw new UnprocessableEntityException(
        "Cet élève n'a pas d'inscription active dans l'année scolaire en cours.",
      );
    }
    if (
      type === 'ATTESTATION_SCOLARITE' &&
      (!school.directeurNom?.trim() || !school.ville?.trim())
    ) {
      throw new UnprocessableEntityException(
        actor.type === 'PARENT'
          ? "Ce document n'est pas encore disponible : contactez le secrétariat de l'école."
          : "Renseignez le nom du directeur et la ville dans Paramètres, Établissement, avant d'émettre une attestation.",
      );
    }

    const where = {
      studentId: student.id,
      type,
      academicYearId: enrollment.academicYearId,
      annuleLe: null,
    };
    if (!renouveler) {
      const existing = await this.prisma.issuedDocument.findFirst({ where });
      if (existing) return existing;
    }

    const snapshot: DocumentSnapshot = {
      eleve: {
        nom: student.nom,
        prenom: student.prenom,
        sexe: student.sexe,
        dateNaissance: isoDate(student.dateNaissance),
        lieuNaissance: student.lieuNaissance,
        matricule: student.matricule,
      },
      classe: enrollment.class.nom,
      annee: {
        libelle: enrollment.academicYear.libelle,
        debut: isoDate(enrollment.academicYear.dateDebut),
        fin: isoDate(enrollment.academicYear.dateFin),
      },
      ecole: {
        nom: school.nom,
        adresse: school.adresse,
        telephone: school.telephone,
        logoUrl: school.logoUrl,
      },
      directeur: {
        nom: school.directeurNom,
        titre: school.directeurTitre,
        ville: school.ville,
        signatureUrl: school.signatureUrl,
      },
      // Une carte est valable jusqu'à la fin de l'année scolaire (D113, à confirmer).
      echeance: isoDate(enrollment.academicYear.dateFin),
    };

    const { doc, created } = await this.prisma.$transaction(async (tx) => {
      // Verrou sur la ligne de l'élève : deux demandes simultanées (secrétariat et parent) se suivent, la seconde
      // retrouve le document de la première au lieu d'en créer un second.
      await tx.$queryRaw`SELECT "id" FROM "students" WHERE "id" = ${student.id} FOR UPDATE`;
      const current = await tx.issuedDocument.findFirst({ where });
      if (current && !renouveler) return { doc: current, created: false };
      if (current) {
        await tx.issuedDocument.update({
          where: { id: current.id },
          data: {
            annuleLe: new Date(),
            motifAnnulation: 'Remplacé par un nouveau document.',
            annuleParUserId: actor.type === 'STAFF' ? actor.id : null,
          },
        });
      }
      const year = new Date().getFullYear();
      const n = await this.numbers.next(
        school.id,
        `DOC_${PREFIX[type]}`,
        String(year),
      );
      const row = await tx.issuedDocument.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: enrollment.academicYearId,
          type,
          numero: `${PREFIX[type]}-${year}-${String(n).padStart(6, '0')}`,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          emisParType: actor.type,
          emisParId: actor.id,
        },
      });
      return { doc: row, created: true };
    });

    if (created) {
      await this.audit.log({
        schoolId: school.id,
        userId: actor.type === 'STAFF' ? actor.id : null,
        action: 'DOCUMENT_ISSUE',
        entite: 'IssuedDocument',
        entiteId: doc.id,
        nouvelleValeur: {
          type,
          numero: doc.numero,
          studentId: student.id,
          emisParType: actor.type,
          emisParId: actor.id,
          renouveler,
        },
      });
    }
    return doc;
  }

  async listForStudent(studentId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Élève introuvable.');
    const docs = await this.prisma.issuedDocument.findMany({
      where: { studentId },
      orderBy: { dateEmission: 'desc' },
    });
    return docs.map(toView);
  }

  async cancel(id: string, motif: string, userId: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const doc = await this.prisma.issuedDocument.findFirst({
      where: { id, schoolId },
    });
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.annuleLe)
      throw new ConflictException('Ce document est déjà annulé.');
    const updated = await this.prisma.issuedDocument.update({
      where: { id },
      data: {
        annuleLe: new Date(),
        motifAnnulation: motif.trim(),
        annuleParUserId: userId,
      },
    });
    await this.audit.log({
      schoolId,
      userId,
      action: 'DOCUMENT_CANCEL',
      entite: 'IssuedDocument',
      entiteId: id,
      nouvelleValeur: {
        numero: doc.numero,
        type: doc.type,
        motif: motif.trim(),
      },
    });
    return toView(updated);
  }

  /**
   * Cartes de toute une classe : émet celles qui manquent, renvoie toutes les cartes actives. Idempotent : si une
   * émission échoue en cours de route, la relancer complète le reste sans dupliquer ce qui existe déjà.
   */
  async issueClassCards(classId: string, userId: string) {
    const school = await this.schoolService.getDefault();
    const klass = await this.prisma.class.findFirst({
      where: { id: classId, academicYear: { schoolId: school.id } },
      include: { academicYear: true },
    });
    if (!klass) throw new NotFoundException('Classe introuvable.');
    if (klass.academicYear.statut !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        "Cette classe n'appartient pas à l'année scolaire active.",
      );
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, statut: 'ACTIVE', student: { statut: 'ACTIF' } },
      include: { class: true, academicYear: true, student: true },
      orderBy: { student: { nom: 'asc' } },
    });
    if (enrollments.length > CLASS_CARDS_MAX) {
      throw new UnprocessableEntityException(
        `Cette classe compte ${enrollments.length} élèves : au plus ${CLASS_CARDS_MAX} cartes à la fois.`,
      );
    }
    const actor: IssueActor = { type: 'STAFF', id: userId };
    const documents: ReturnType<typeof toView>[] = [];
    let crees = 0;
    for (const e of enrollments) {
      const before = await this.prisma.issuedDocument.findFirst({
        where: {
          studentId: e.studentId,
          type: 'CARTE_ELEVE',
          academicYearId: e.academicYearId,
          annuleLe: null,
        },
        select: { id: true },
      });
      const doc = await this.issueForEnrollment(
        school,
        e.student,
        e,
        'CARTE_ELEVE',
        actor,
        false,
      );
      if (!before) crees += 1;
      documents.push(toView(doc));
    }
    await this.audit.log({
      schoolId: school.id,
      userId,
      action: 'DOCUMENT_CARDS_BULK',
      entite: 'Class',
      entiteId: classId,
      nouvelleValeur: {
        classe: klass.nom,
        eleves: enrollments.length,
        cartesCreees: crees,
      },
    });
    return { classe: klass.nom, documents, cartesCreees: crees };
  }

  /**
   * Vérification publique (QR code). Ne révèle que ce qui est imprimé sur le papier : jamais la date de naissance,
   * l'adresse, le matricule, les responsables ni la photo.
   */
  async verify(token: string) {
    const doc = await this.prisma.issuedDocument.findFirst({
      where: { verificationToken: token },
    });
    if (!doc)
      throw new NotFoundException('Document introuvable ou jeton invalide.');
    const snap = doc.snapshot as unknown as DocumentSnapshot;
    return {
      type: doc.type,
      numero: doc.numero,
      statut: doc.annuleLe ? ('ANNULE' as const) : ('VALIDE' as const),
      dateEmission: doc.dateEmission,
      eleve: { nom: snap.eleve.nom, prenom: snap.eleve.prenom },
      classe: snap.classe,
      annee: snap.annee.libelle,
      etablissement: snap.ecole.nom,
    };
  }
}
