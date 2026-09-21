// PDF des documents officiels (Lot 19), produits dans le navigateur à partir du contenu FIGÉ à l'émission : une
// réimpression donne exactement le même document. Seule la photo de la carte est lue en direct (elle peut être remplacée).
import QRCode from "qrcode";
import type { jsPDF as JsPdf } from "jspdf";
import { API_URL } from "@/lib/api";
import { attestationText, formatDocDate, shortUrl, verifyUrl, type DocLocale, type IssuedDocumentView } from "@/lib/documents";

const PRIMARY: [number, number, number] = [47, 43, 120];
const MUTED: [number, number, number] = [110, 110, 125];

// ------------------------------------------------------------------ images

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Redessine une image (WebP par exemple) en PNG ou JPEG, les seuls formats que le PDF sait intégrer. */
async function reencode(blob: Blob, mime: "image/png" | "image/jpeg", crop?: { ratio: number }): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (crop) {
    // Recadrage centré au rapport largeur/hauteur voulu (photo d'identité), jamais déformée.
    const current = sw / sh;
    if (current > crop.ratio) {
      sw = sh * crop.ratio;
      sx = (bitmap.width - sw) / 2;
    } else {
      sh = sw / crop.ratio;
      sy = (bitmap.height - sh) / 2;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, 0.92);
}

export interface PdfImage {
  data: string;
  format: "PNG" | "JPEG";
}

/** Image publique de l'école (logo, signature) : facultative, le document reste valable sans elle. */
async function loadPublicImage(url: string | null): Promise<PdfImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(`${API_URL}${url}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type === "image/png") return { data: await blobToDataUrl(blob), format: "PNG" };
    if (blob.type === "image/jpeg") return { data: await blobToDataUrl(blob), format: "JPEG" };
    return { data: await reencode(blob, "image/png"), format: "PNG" };
  } catch {
    return null;
  }
}

/** Photo d'un élève (blob lu avec le jeton), recadrée au format portrait 3:4 et intégrée en JPEG. */
export async function photoToPdfImage(blob: Blob): Promise<PdfImage | null> {
  try {
    return { data: await reencode(blob, "image/jpeg", { ratio: 3 / 4 }), format: "JPEG" };
  } catch {
    return null;
  }
}

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 300, margin: 1, errorCorrectionLevel: "M" });
}

// ------------------------------------------------------------------ attestation

/** Attestation de scolarité, A4 portrait : en-tête, texte, lieu et date, signature, QR code de vérification. */
export async function buildAttestationPdf(doc: IssuedDocumentView, locale: DocLocale, origin: string): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const link = verifyUrl(origin, doc.verificationToken);
  const [logo, signature, qr] = await Promise.all([
    loadPublicImage(doc.snapshot.ecole.logoUrl),
    loadPublicImage(doc.snapshot.directeur.signatureUrl),
    qrDataUrl(link),
  ]);
  const text = attestationText(doc, locale, shortUrl(link));
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 60;
  const contentWidth = pageWidth - margin * 2;
  const school = doc.snapshot.ecole;

  // En-tête : logo, nom et coordonnées de l'école.
  let textX = margin;
  if (logo) {
    try {
      pdf.addImage(logo.data, logo.format, margin, 40, 56, 56);
      textX = margin + 70;
    } catch {
      textX = margin;
    }
  }
  pdf.setTextColor(...PRIMARY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(school.nom, textX, 62);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...MUTED);
  let y = 78;
  if (school.adresse) {
    pdf.text(school.adresse, textX, y);
    y += 13;
  }
  if (school.telephone) pdf.text(school.telephone, textX, y);
  pdf.setDrawColor(...PRIMARY);
  pdf.setLineWidth(1.2);
  pdf.line(margin, 112, pageWidth - margin, 112);

  // Titre et numéro.
  pdf.setTextColor(...PRIMARY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(text.title, pageWidth / 2, 175, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...MUTED);
  pdf.text(locale === "fr" ? `N° ${doc.numero}` : `No. ${doc.numero}`, pageWidth / 2, 195, { align: "center" });

  // Corps.
  pdf.setTextColor(20, 20, 30);
  pdf.setFontSize(12.5);
  let bodyY = 250;
  for (const paragraph of text.paragraphs) {
    const lines = pdf.splitTextToSize(paragraph, contentWidth) as string[];
    pdf.text(lines, margin, bodyY, { lineHeightFactor: 1.6 });
    bodyY += lines.length * 12.5 * 1.6 + 16;
  }

  // Lieu, date et signature.
  const signY = Math.max(bodyY + 30, 430);
  pdf.setFontSize(12);
  pdf.text(text.place, pageWidth - margin, signY, { align: "right" });
  pdf.setFont("helvetica", "bold");
  pdf.text(text.signerTitle, pageWidth - margin, signY + 26, { align: "right" });
  if (signature) {
    try {
      const props = pdf.getImageProperties(signature.data);
      const maxW = 150;
      const maxH = 64;
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      pdf.addImage(signature.data, signature.format, pageWidth - margin - w, signY + 32, w, h);
    } catch {
      // Une signature illisible n'empêche pas le document.
    }
  }
  pdf.setFont("helvetica", "normal");
  pdf.text(text.signerName, pageWidth - margin, signY + 32 + 64 + 18, { align: "right" });

  // Vérification : QR code et adresse.
  const qrSize = 78;
  const footerY = pageHeight - 60 - qrSize;
  pdf.setDrawColor(200, 200, 210);
  pdf.setLineWidth(0.6);
  pdf.line(margin, footerY - 14, pageWidth - margin, footerY - 14);
  pdf.addImage(qr, "PNG", margin, footerY, qrSize, qrSize);
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  const note = pdf.splitTextToSize(text.verifyNote, contentWidth - qrSize - 16) as string[];
  pdf.text(note, margin + qrSize + 16, footerY + 14);
  return pdf;
}

export async function downloadAttestationPdf(doc: IssuedDocumentView, locale: DocLocale): Promise<void> {
  const pdf = await buildAttestationPdf(doc, locale, window.location.origin);
  const s = doc.snapshot.eleve;
  pdf.save(`${locale === "fr" ? "Attestation" : "Certificate"}-${s.nom}-${s.prenom}-${doc.numero}.pdf`.replace(/[^\w.-]+/g, "-"));
}

// ------------------------------------------------------------------ cartes

// Format carte bancaire (CR80) : 85,6 x 54 mm, en points.
const CARD_W = 242.6;
const CARD_H = 153;

function drawCardFront(pdf: JsPdf, doc: IssuedDocumentView, logo: PdfImage | null, photo: PdfImage | null): void {
  const s = doc.snapshot;
  // Bandeau supérieur.
  pdf.setFillColor(...PRIMARY);
  pdf.rect(0, 0, CARD_W, 34, "F");
  let textX = 10;
  if (logo) {
    try {
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(8, 5, 24, 24, 3, 3, "F");
      pdf.addImage(logo.data, logo.format, 9.5, 6.5, 21, 21);
      textX = 38;
    } catch {
      textX = 10;
    }
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(s.ecole.nom, CARD_W - textX - 8) as string[], textX, 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.text("CARTE D'ÉLÈVE / STUDENT ID CARD", textX, 27);

  // Photo (ou espace réservé avec les initiales).
  const px = 10;
  const py = 43;
  const pw = 54;
  const ph = 72;
  if (photo) {
    try {
      pdf.addImage(photo.data, photo.format, px, py, pw, ph);
    } catch {
      photo = null;
    }
  }
  if (!photo) {
    pdf.setFillColor(235, 235, 242);
    pdf.rect(px, py, pw, ph, "F");
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(`${s.eleve.prenom.charAt(0)}${s.eleve.nom.charAt(0)}`.toUpperCase(), px + pw / 2, py + ph / 2 + 6, { align: "center" });
  }
  pdf.setDrawColor(...PRIMARY);
  pdf.setLineWidth(0.8);
  pdf.rect(px, py, pw, ph);

  // Identité.
  const x = px + pw + 12;
  const width = CARD_W - x - 8;
  pdf.setTextColor(20, 20, 30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  const nameLines = pdf.splitTextToSize(s.eleve.nom.toUpperCase(), width) as string[];
  pdf.text(nameLines, x, 54);
  let y = 54 + nameLines.length * 12;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const firstLines = pdf.splitTextToSize(s.eleve.prenom, width) as string[];
  pdf.text(firstLines, x, y);
  y += firstLines.length * 11 + 6;
  const rows: Array<[string, string]> = [
    ["Matricule", s.eleve.matricule],
    ["Classe / Class", s.classe],
    ["Année / Year", s.annee.libelle],
  ];
  pdf.setFontSize(7.5);
  for (const [label, value] of rows) {
    pdf.setTextColor(...MUTED);
    pdf.text(label, x, y);
    pdf.setTextColor(20, 20, 30);
    pdf.setFont("helvetica", "bold");
    pdf.text(value, x, y + 9);
    pdf.setFont("helvetica", "normal");
    y += 20;
  }
}

async function drawCardBack(pdf: JsPdf, doc: IssuedDocumentView, origin: string): Promise<void> {
  const s = doc.snapshot;
  const link = verifyUrl(origin, doc.verificationToken);
  const qr = await qrDataUrl(link);
  pdf.setFillColor(...PRIMARY);
  pdf.rect(0, 0, CARD_W, 12, "F");
  const qrSize = 76;
  pdf.addImage(qr, "PNG", 10, 24, qrSize, qrSize);
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);
  pdf.text("Scannez pour vérifier", 10 + qrSize / 2, 24 + qrSize + 8, { align: "center" });
  pdf.text("Scan to verify", 10 + qrSize / 2, 24 + qrSize + 15, { align: "center" });

  const x = 10 + qrSize + 12;
  const width = CARD_W - x - 8;
  pdf.setTextColor(20, 20, 30);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(`N° ${doc.numero}`, x, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(`Valable jusqu'au / Valid until ${formatDocDate(s.echeance, "fr")}`, x, 43, { maxWidth: width });
  pdf.setTextColor(...MUTED);
  const lost = pdf.splitTextToSize("Si cette carte est trouvée, merci de la rapporter à l'école. / If found, please return it to the school.", width) as string[];
  pdf.text(lost, x, 60);
  let y = 60 + lost.length * 8 + 6;
  pdf.setTextColor(20, 20, 30);
  if (s.ecole.adresse) {
    const a = pdf.splitTextToSize(s.ecole.adresse, width) as string[];
    pdf.text(a, x, y);
    y += a.length * 8;
  }
  if (s.ecole.telephone) pdf.text(s.ecole.telephone, x, y);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(5.5);
  pdf.text(shortUrl(link), CARD_W / 2, CARD_H - 8, { align: "center", maxWidth: CARD_W - 16 });
}

export interface CardSource {
  doc: IssuedDocumentView;
  photo: PdfImage | null;
}

/**
 * Cartes au format carte bancaire : deux pages par élève (recto avec la photo, verso avec le QR code de vérification),
 * prêtes pour une imprimerie de cartes PVC ou une impression à découper.
 */
export async function buildCardsPdf(cards: CardSource[], origin: string): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [CARD_H, CARD_W] });
  const logos = new Map<string, PdfImage | null>();
  let first = true;
  for (const { doc, photo } of cards) {
    const key = doc.snapshot.ecole.logoUrl ?? "";
    if (!logos.has(key)) logos.set(key, await loadPublicImage(doc.snapshot.ecole.logoUrl));
    if (!first) pdf.addPage([CARD_H, CARD_W], "landscape");
    first = false;
    drawCardFront(pdf, doc, logos.get(key) ?? null, photo);
    pdf.addPage([CARD_H, CARD_W], "landscape");
    await drawCardBack(pdf, doc, origin);
  }
  return pdf;
}

export async function downloadCardsPdf(cards: CardSource[], fileName: string): Promise<void> {
  const pdf = await buildCardsPdf(cards, window.location.origin);
  pdf.save(`${fileName.replace(/[^\w.-]+/g, "-")}.pdf`);
}
