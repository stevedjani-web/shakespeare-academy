// Fiche de synthèse (vue 360°) d'un élève, produite dans le navigateur — même patron que le bulletin
// (lib/bulletin-pdf.ts). Réunit identité, responsables, situation financière, assiduité et notes.
//
// La discipline n'y figure JAMAIS, volontairement : le dossier de vie scolaire d'un élève n'est chargé
// qu'à une ouverture explicite (StudentDisciplineCard), car chaque lecture y est journalisée. Générer
// cette fiche ne doit jamais déclencher cette lecture en silence.
import { API_URL } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatNote, rankLabel, type StudentBulletinRow } from "@/lib/grades";
import type { FinancialStatus, StudentAttendanceHistory } from "@/lib/types";

export interface StudentSummaryData {
  ecole: { nom: string; adresse: string | null; telephone: string | null; logoUrl: string | null };
  eleve: {
    nom: string;
    prenom: string;
    matricule: string;
    sexe: "M" | "F";
    dateNaissance: string | null;
    lieuNaissance: string | null;
    nationalite: string | null;
  };
  classe: string | null;
  responsables: Array<{ nom: string | null; prenom: string | null; telephone: string | null; lien: string | null }>;
  finance: FinancialStatus | null;
  assiduite: StudentAttendanceHistory | null;
  bulletins: StudentBulletinRow[] | null;
  editePar: string;
}

async function loadLogo(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(`${API_URL}${logoUrl}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const FINANCE_LABEL: Record<string, string> = {
  SOLVABLE: "Solvable",
  A_ECHOIR: "À échoir",
  EN_RETARD: "En retard",
  IMPAYE_CRITIQUE: "Impayé critique",
  EXONERE: "Exonéré",
};

export async function downloadStudentSummaryPdf(data: StudentSummaryData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadLogo(data.ecole.logoUrl),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // En-tête : logo, école.
  let textX = margin;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, 28, 48, 48);
      textX = margin + 60;
    } catch {
      textX = margin;
    }
  }
  doc.setTextColor(47, 43, 120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.ecole.nom, textX, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 107, 123);
  const contact = [data.ecole.adresse, data.ecole.telephone].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, textX, 60);

  doc.setDrawColor(47, 43, 120);
  doc.setLineWidth(1.2);
  doc.line(margin, 86, pageWidth - margin, 86);

  doc.setTextColor(30, 30, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Fiche de synthèse — ${data.eleve.prenom} ${data.eleve.nom}`, pageWidth / 2, 112, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Éditée le ${formatDate(new Date().toISOString())} par ${data.editePar}`, pageWidth / 2, 127, { align: "center" });

  // Identité.
  let y = 155;
  doc.setFontSize(10);
  const identite: Array<[string, string]> = [
    ["Matricule", data.eleve.matricule],
    ["Sexe", data.eleve.sexe === "M" ? "Masculin" : "Féminin"],
    ["Date de naissance", formatDate(data.eleve.dateNaissance)],
    ["Lieu de naissance", data.eleve.lieuNaissance ?? "—"],
    ["Nationalité", data.eleve.nationalite ?? "—"],
    ["Classe actuelle", data.classe ?? "Aucune inscription active"],
  ];
  for (const [label, value] of identite) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 130, y);
    y += 14;
  }

  // Responsables.
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(47, 43, 120);
  doc.text("Responsables", margin, y);
  doc.setTextColor(30, 30, 40);
  y += 6;
  if (data.responsables.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 12;
    doc.text("Aucun responsable enregistré.", margin, y);
  } else {
    autoTable(doc, {
      startY: y + 6,
      head: [["Nom", "Lien", "Téléphone"]],
      body: data.responsables.map((r) => [
        [r.prenom, r.nom].filter(Boolean).join(" ") || "—",
        r.lien ?? "—",
        r.telephone ?? "—",
      ]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: [220, 220, 230] },
      headStyles: { fillColor: [47, 43, 120], textColor: 255 },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
  }

  // Situation financière.
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(47, 43, 120);
  doc.text("Situation financière", margin, y);
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(10);
  y += 16;
  if (data.finance) {
    const f = data.finance;
    const label = FINANCE_LABEL[f.statut] ?? f.statut;
    doc.setFont("helvetica", "normal");
    doc.text(
      `Statut : ${label}   ·   Facturé : ${f.montantFacture.toLocaleString("fr-FR")}   ·   Payé : ${f.montantPaye.toLocaleString("fr-FR")}   ·   Restant dû : ${f.montantRestant.toLocaleString("fr-FR")}`,
      margin,
      y,
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.text("Non disponible.", margin, y);
  }

  // Assiduité.
  y += 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(47, 43, 120);
  doc.text("Assiduité", margin, y);
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(10);
  y += 16;
  if (data.assiduite) {
    const c = data.assiduite.compteurs;
    doc.setFont("helvetica", "normal");
    doc.text(
      `${c.absences} absence(s), ${c.retards} retard(s) sur ${c.seancesAppelees} séance(s) appelée(s) (dont ${c.excusees} excusée(s), ${c.nonJustifiees} non justifiée(s))`,
      margin,
      y,
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.text("Non disponible.", margin, y);
  }

  // Notes et bulletins.
  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(47, 43, 120);
  doc.text("Notes et bulletins", margin, y);
  doc.setTextColor(30, 30, 40);
  if (data.bulletins && data.bulletins.length > 0) {
    autoTable(doc, {
      startY: y + 8,
      head: [["Trimestre", "Classe", "Moyenne /20", "Rang", "Statut"]],
      body: data.bulletins.map((b) => [
        b.trimestre,
        b.classe,
        formatNote(b.moyenneGenerale),
        rankLabel(b.rang, b.effectif),
        b.statut === "PUBLIE" ? "Publié" : "Validé (non publié)",
      ]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: [220, 220, 230] },
      headStyles: { fillColor: [47, 43, 120], textColor: 255 },
      margin: { left: margin, right: margin },
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Aucun bulletin pour l'instant.", margin, y + 14);
  }

  const name = `fiche-synthese-${data.eleve.nom}-${data.eleve.prenom}`
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-");
  doc.save(`${name}.pdf`);
}
