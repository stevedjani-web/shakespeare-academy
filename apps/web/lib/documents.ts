// Documents officiels (Lot 19) : types et textes. Fonctions pures, contrôlées par scripts/check-documents.mjs.

export type DocumentType = "ATTESTATION_SCOLARITE" | "CARTE_ELEVE";
export type DocLocale = "fr" | "en";

export interface DocumentSnapshot {
  eleve: { nom: string; prenom: string; sexe: "M" | "F"; dateNaissance: string; lieuNaissance: string | null; matricule: string };
  classe: string;
  annee: { libelle: string; debut: string; fin: string };
  ecole: { nom: string; adresse: string | null; telephone: string | null; logoUrl: string | null };
  directeur: { nom: string | null; titre: string; ville: string | null; signatureUrl: string | null };
  echeance: string;
}

export interface IssuedDocumentView {
  id: string;
  studentId: string;
  type: DocumentType;
  numero: string;
  verificationToken: string;
  dateEmission: string;
  annuleLe: string | null;
  motifAnnulation: string | null;
  emisParType: "STAFF" | "PARENT";
  snapshot: DocumentSnapshot;
}

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  ATTESTATION_SCOLARITE: "Attestation de scolarité",
  CARTE_ELEVE: "Carte d'élève",
};

/** Adresse ouverte en scannant le QR code : la page publique de vérification. */
export function verifyUrl(origin: string, token: string): string {
  return `${origin}/verifier-document/${token}`;
}

/** Date lisible (AAAA-MM-JJ ou horodatage ISO), en français (JJ/MM/AAAA) ou en anglais (DD Month YYYY). */
export function formatDocDate(iso: string, locale: DocLocale): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (locale === "fr") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

const lcFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Titres par défaut en anglais ; un titre personnalisé est repris tel quel.
const TITLE_EN: Record<string, string> = { "le directeur": "the Headmaster", "la directrice": "the Headmistress" };

export function signerTitle(titre: string, locale: DocLocale): string {
  if (locale === "en") return TITLE_EN[titre.trim().toLowerCase()] ?? lcFirst(titre.trim());
  return lcFirst(titre.trim());
}

export interface AttestationText {
  title: string;
  paragraphs: string[];
  place: string;
  signerTitle: string;
  signerName: string;
  verifyNote: string;
}

/** Texte de l'attestation, accordé au sexe de l'élève, sans lieu de naissance si non renseigné. */
export function attestationText(doc: IssuedDocumentView, locale: DocLocale, verifyLink: string): AttestationText {
  const s = doc.snapshot;
  const fullName = `${s.eleve.prenom} ${s.eleve.nom.toUpperCase()}`;
  const born = formatDocDate(s.eleve.dateNaissance, locale);
  const signer = s.directeur.nom ?? "";
  const title = signerTitle(s.directeur.titre, locale);
  const place = s.directeur.ville ?? "";
  const issued = formatDocDate(doc.dateEmission, locale);
  if (locale === "fr") {
    const fem = s.eleve.sexe === "F";
    const birth = s.eleve.lieuNaissance ? `${fem ? "née" : "né"} le ${born} à ${s.eleve.lieuNaissance}` : `${fem ? "née" : "né"} le ${born}`;
    return {
      title: "ATTESTATION DE SCOLARITÉ",
      paragraphs: [
        `Je soussigné(e), ${signer}, ${title} de ${s.ecole.nom}, atteste que l'élève ${fullName}, ${birth}, matricule ${s.eleve.matricule}, est régulièrement ${fem ? "inscrite" : "inscrit"} en classe de ${s.classe} pour l'année scolaire ${s.annee.libelle}.`,
        "La présente attestation est délivrée à l'intéressé(e), ou à son représentant légal, pour servir et valoir ce que de droit.",
      ],
      place: `Fait à ${place}, le ${issued}`,
      signerTitle: s.directeur.titre,
      signerName: signer,
      verifyNote: `Document n° ${doc.numero}. Pour vérifier son authenticité, scannez le QR code ou ouvrez ${verifyLink}`,
    };
  }
  const birth = s.eleve.lieuNaissance ? `born on ${born} in ${s.eleve.lieuNaissance}` : `born on ${born}`;
  return {
    title: "CERTIFICATE OF ENROLLMENT",
    paragraphs: [
      `I, the undersigned, ${signer}, ${title} of ${s.ecole.nom}, certify that ${fullName}, ${birth}, student number ${s.eleve.matricule}, is duly enrolled in the class of ${s.classe} for the ${s.annee.libelle} school year.`,
      "This certificate is issued to the student, or to their legal representative, for all legal purposes.",
    ],
    place: `Issued in ${place}, on ${issued}`,
    signerTitle: TITLE_EN[s.directeur.titre.trim().toLowerCase()] ? capitalize(TITLE_EN[s.directeur.titre.trim().toLowerCase()]) : s.directeur.titre,
    signerName: signer,
    verifyNote: `Document no. ${doc.numero}. To check its authenticity, scan the QR code or open ${verifyLink}`,
  };
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Adresse de la page de vérification sans le protocole : plus courte, lisible sur une carte. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Nom de fichier sûr pour un PDF : lettres, chiffres, tirets. */
export function safeFileName(...parts: string[]): string {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
