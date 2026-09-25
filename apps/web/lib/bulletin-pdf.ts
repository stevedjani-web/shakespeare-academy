// Bulletin de notes en PDF, produit dans le navigateur à partir des données du bulletin figé (jamais des notes en
// direct). Utilisé par la Direction et par les parents : le même document dans les deux cas.
import { API_URL } from "@/lib/api";
import { formatNote, rankLabel, type BulletinData } from "@/lib/grades";
import { translate as t } from "@/lib/i18n";

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
    // Le bulletin reste valable sans logo.
    return null;
  }
}

function frDate(iso: string | null): string {
  if (!iso) return t("common.notProvided");
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export async function downloadBulletinPdf(bulletin: BulletinData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadLogo(bulletin.ecole.logoUrl),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const withStats = bulletin.matieres.some((m) => m.moyenneClasse !== undefined);
  const withLetters = bulletin.affichageLettres;

  // En-tête : logo, école, coordonnées.
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
  doc.text(bulletin.ecole.nom, textX, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 107, 123);
  const contact = [bulletin.ecole.adresse, bulletin.ecole.telephone].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, textX, 60);

  doc.setDrawColor(47, 43, 120);
  doc.setLineWidth(1.2);
  doc.line(margin, 86, pageWidth - margin, 86);

  doc.setTextColor(30, 30, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t("bulletin.title", { term: bulletin.trimestre.libelle }), pageWidth / 2, 112, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(t("bulletin.year", { year: bulletin.annee }), pageWidth / 2, 127, { align: "center" });

  // Élève.
  doc.setFontSize(10);
  const rows: Array<[string, string]> = [
    [t("bulletin.student"), `${bulletin.eleve.nom} ${bulletin.eleve.prenom}`],
    [t("bulletin.studentId"), bulletin.eleve.matricule],
    [t("bulletin.born"), frDate(bulletin.eleve.dateNaissance)],
    [t("bulletin.class"), `${bulletin.classe.nom} (${bulletin.classe.niveau}, ${bulletin.classe.section})`],
  ];
  let y = 152;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 70, y);
    y += 15;
  }

  const head = [
    [
      t("bulletin.subject"),
      t("bulletin.coef"),
      t("bulletin.average"),
      ...(withLetters ? [t("bulletin.letter")] : []),
      ...(withStats ? [t("bulletin.classAverageShort"), t("bulletin.min"), t("bulletin.max")] : []),
      t("bulletin.appreciation"),
    ],
  ];
  const body = bulletin.matieres.map((m) => [
    m.nom,
    String(m.coefficient),
    formatNote(m.moyenne),
    ...(withLetters ? [m.lettre ?? "-"] : []),
    ...(withStats ? [formatNote(m.moyenneClasse), formatNote(m.min), formatNote(m.max)] : []),
    m.appreciation ?? "",
  ]);
  const lastColumn = head[0].length - 1;
  autoTable(doc, {
    startY: y + 8,
    head,
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: [220, 220, 230] },
    headStyles: { fillColor: [47, 43, 120], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 244, 252] },
    columnStyles: { [lastColumn]: { cellWidth: 150 }, 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (table?.finalY ?? y) + 22;

  // Synthèse.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(47, 43, 120);
  doc.text(t("bulletin.overall", { avg: formatNote(bulletin.moyenneGenerale) }), margin, y);
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 40);
  const extra: string[] = [];
  if (bulletin.lettre) extra.push(t("bulletin.letterLine", { letter: bulletin.lettre }));
  if (bulletin.rang !== undefined && bulletin.rang !== null) extra.push(t("bulletin.rankLine", { rank: rankLabel(bulletin.rang, bulletin.effectif) }));
  if (bulletin.moyenneClasse !== undefined && bulletin.moyenneClasse !== null) extra.push(t("bulletin.classAverageLine", { avg: formatNote(bulletin.moyenneClasse) }));
  if (bulletin.admis !== null) extra.push(bulletin.admis ? t("bulletin.admitted") : t("bulletin.notAdmitted"));
  if (extra.length > 0) {
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.text(extra.join("   ·   "), margin, y);
  }
  if (bulletin.appreciationGenerale) {
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.text(t("bulletin.generalAppreciation"), margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(bulletin.appreciationGenerale, pageWidth - margin * 2) as string[];
    doc.text(lines, margin, y + 14);
    y += 14 + lines.length * 12;
  }

  // Signatures.
  y = Math.max(y + 40, 690);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setDrawColor(150, 150, 165);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 160, y);
  doc.line(pageWidth - margin - 160, y, pageWidth - margin, y);
  doc.text(t("bulletin.signGuardian"), margin, y + 12);
  doc.text(t("bulletin.signDirection"), pageWidth - margin - 160, y + 12);

  const name = `${t("bulletin.fileName")}-${bulletin.eleve.nom}-${bulletin.eleve.prenom}-${bulletin.trimestre.libelle}`
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-");
  doc.save(`${name}.pdf`);
}
