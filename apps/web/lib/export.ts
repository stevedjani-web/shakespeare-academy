// Export des listes en Excel (.xlsx) et PDF, 100 % côté navigateur : les données affichées à
// l'écran (déjà chargées, déjà filtrées) sont exportées telles quelles, sans aller-retour serveur.
// Les bibliothèques sont chargées à la demande (import dynamique) pour ne pas alourdir les pages.

export type ExportCell = string | number | null | undefined;

export interface ExportSection {
  /** Titre de la section (nom de l'onglet Excel, titre du tableau dans le PDF). */
  title: string;
  headers: string[];
  rows: ExportCell[][];
  /** Colonnes numériques (alignées à droite ; format monétaire si `money`). */
  numeric?: number[];
  money?: number[];
  /** Ligne de total affichée en bas (mêmes colonnes que `headers`). */
  totals?: ExportCell[];
}

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportCell;
  kind?: "text" | "number" | "money";
}

export function buildSection<T>(title: string, columns: ExportColumn<T>[], rows: T[], totals?: ExportCell[]): ExportSection {
  return {
    title,
    headers: columns.map((c) => c.header),
    rows: rows.map((r) => columns.map((c) => c.value(r))),
    numeric: columns.flatMap((c, i) => (c.kind === "number" || c.kind === "money" ? [i] : [])),
    money: columns.flatMap((c, i) => (c.kind === "money" ? [i] : [])),
    totals,
  };
}

const PRIMARY = "#2f2b78";
const SOFT = "#eeecfa";

function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "export";
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function frDate(): string {
  return new Date().toLocaleDateString("fr-FR");
}

// jsPDF (polices standard) n'affiche pas l'espace fine insécable que produit toLocaleString("fr-FR").
function pdfNumber(n: number): string {
  return n.toLocaleString("fr-FR").replace(/[  ]/g, " ");
}

function excelSheetName(title: string, index: number, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 28) || `Feuille ${index + 1}`;
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  used.add(name.toLowerCase());
  return name;
}

export async function exportExcel(fileName: string, sections: ExportSection[], schoolName?: string): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");

  const usedNames = new Set<string>();
  const sheets = sections.map((s, index) => {
    const numeric = new Set(s.numeric ?? []);
    const money = new Set(s.money ?? []);
    const width = s.headers.length;

    const titleRow = [
      { value: schoolName ? `${schoolName} - ${s.title}` : s.title, fontWeight: "bold" as const, fontSize: 14, textColor: PRIMARY, columnSpan: width },
      ...Array<null>(Math.max(0, width - 1)).fill(null),
    ];
    const headerRow = s.headers.map((h, i) => ({
      value: h,
      fontWeight: "bold" as const,
      textColor: "#ffffff",
      backgroundColor: PRIMARY,
      align: numeric.has(i) ? ("right" as const) : ("left" as const),
    }));
    const dataRows = s.rows.map((row, r) =>
      row.map((cell, i) => {
        const base = { backgroundColor: r % 2 === 1 ? SOFT : undefined };
        if (typeof cell === "number") {
          return { ...base, value: cell, type: Number, format: money.has(i) ? "#,##0" : "0", align: "right" as const };
        }
        if (cell === null || cell === undefined || cell === "") return { ...base, value: null };
        return { ...base, value: String(cell), type: String };
      }),
    );
    const totalsRow = s.totals
      ? s.totals.map((cell, i) => {
          const base = { fontWeight: "bold" as const, backgroundColor: "#faf1dc" };
          if (typeof cell === "number") {
            return { ...base, value: cell, type: Number, format: money.has(i) ? "#,##0" : "0", align: "right" as const };
          }
          return { ...base, value: cell === null || cell === undefined || cell === "" ? null : String(cell), type: String };
        })
      : null;

    return {
      data: [titleRow, headerRow, ...dataRows, ...(totalsRow ? [totalsRow] : [])],
      sheet: excelSheetName(s.title, index, usedNames),
      columns: s.headers.map((h, i) => {
        const longest = Math.max(h.length, ...s.rows.map((r) => String(r[i] ?? "").length));
        return { width: Math.min(45, Math.max(10, longest + 2)) };
      }),
      stickyRowsCount: 2,
    };
  });

  // Les types de cellule de la bibliothèque sont stricts sur `format`/`type`; les objets ci-dessus
  // respectent son contrat (voir sa documentation), le cast évite de dupliquer ses types internes.
  await writeExcelFile(sheets as never).toFile(`${safeFileName(fileName)}-${stamp()}.xlsx`);
}

export async function exportPdf(
  fileName: string,
  title: string,
  sections: ExportSection[],
  options: { schoolName?: string; subtitle?: string; landscape?: boolean } = {},
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const wide = options.landscape ?? sections.some((s) => s.headers.length > 6);
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  doc.setFillColor(47, 43, 120);
  doc.rect(0, 0, pageWidth, 54, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(options.schoolName ?? "Shakespeare Academy", margin, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(title, margin, 42);
  doc.text(`Édité le ${frDate()}`, pageWidth - margin, 42, { align: "right" });

  let cursorY = 74;
  if (options.subtitle) {
    doc.setTextColor(107, 107, 123);
    doc.setFontSize(9);
    doc.text(options.subtitle, margin, cursorY);
    cursorY += 14;
  }

  sections.forEach((section, index) => {
    const numeric = new Set(section.numeric ?? []);
    const money = new Set(section.money ?? []);
    const format = (cell: ExportCell, col: number): string => {
      if (typeof cell === "number") return money.has(col) ? pdfNumber(cell) : String(cell);
      return cell === null || cell === undefined ? "" : String(cell);
    };

    if (sections.length > 1 || section.title !== title) {
      const needed = 60;
      if (index > 0 && cursorY + needed > pageHeight - 40) {
        doc.addPage();
        cursorY = 40;
      }
      doc.setTextColor(47, 43, 120);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(section.title, margin, cursorY);
      cursorY += 8;
    }

    autoTable(doc, {
      startY: cursorY,
      head: [section.headers],
      body: section.rows.map((row) => row.map((cell, i) => format(cell, i))),
      foot: section.totals ? [section.totals.map((cell, i) => format(cell, i))] : undefined,
      margin: { left: margin, right: margin, bottom: 40 },
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [26, 26, 46], lineColor: [231, 227, 216] },
      headStyles: { fillColor: [47, 43, 120], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [250, 241, 220], textColor: [26, 26, 46], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 241, 234] },
      didParseCell: (data) => {
        if (numeric.has(data.column.index)) data.cell.styles.halign = "right";
      },
      showFoot: "lastPage",
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(107, 107, 123);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: "right" });
    doc.text(options.schoolName ?? "Shakespeare Academy", margin, pageHeight - 18);
  }

  doc.save(`${safeFileName(fileName)}-${stamp()}.pdf`);
}
