"use client";

import { BadgeCheck, ShieldCheck } from "lucide-react";
import { formatMontant } from "@/lib/format";
import { amountInWords } from "@/lib/amount-in-words";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useTrimmedLogo } from "@/lib/school-brand";
import { ParentSpaceCallout } from "@/components/parent-space-callout";
import { BrandMark } from "@/components/brand-mark";

export interface ReceiptSchool {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  logoUrl: string | null;
  devise?: string;
}

export interface ReceiptSheetProps {
  school: ReceiptSchool | null;
  /** Numéro affiché : REC-000012, ou PROV-… pour un reçu provisoire. */
  numero: string;
  dateLabel: string;
  /** Reçu établi sans Internet : jamais de cachet ni de signature automatiques, pas de code de vérification. */
  provisional?: boolean;
  /** Encaissé avant l'application et repris après coup : jamais de cachet ni de signature automatiques. */
  reprise?: boolean;
  replacesNumber?: string | null;
  cancelled?: { motif: string | null } | null;
  student?: { nom: string; matricule: string; classe: string } | null;
  reason: string;
  method: string;
  reference?: string | null;
  cashier: string;
  /** Part imputée à la scolarité. */
  montant: number;
  /** Frais de service payés EN PLUS (paiement en ligne) : le total payé est montant + fraisService. */
  fraisService?: number;
  /** Images déjà chargées (avec le jeton) : `null` = emplacement vide, à signer ou tamponner à la main. */
  cachetSrc?: string | null;
  signatureSrc?: string | null;
  /** QR code de vérification (reçu officiel seulement). */
  verifyQr?: string | null;
  footer: string;
}

/**
 * Reçu de paiement : une seule feuille A4 à l'impression (marges de 10 mm, jamais une deuxième page), lisible d'un coup
 * d'œil à l'écran. Le logo de l'école en filigrane et le bandeau d'en-tête sont forcés à l'impression pour que le papier
 * ressemble à l'écran ; le cachet et la signature du caissier sont posés automatiquement sur un reçu officiel non
 * annulé, jamais sur un reçu annulé ni provisoire.
 */
export function ReceiptSheet(props: ReceiptSheetProps) {
  const { t } = useI18n();
  const { school, cancelled, provisional, reprise } = props;
  const logo = useTrimmedLogo(school?.logoUrl);
  const seals = !cancelled && !provisional && !reprise;
  const fee = props.fraisService ?? 0;
  const total = props.montant + fee;

  return (
    <article
      className="receipt-sheet relative mx-auto w-full max-w-[460px] overflow-hidden rounded-3xl border border-border bg-white shadow-[var(--shadow-soft)] print:max-w-[178mm] print:rounded-none print:border-primary/30 print:shadow-none"
      aria-label={t("receipt.title")}
    >
      {/* Une seule page A4, marges de 10 mm : les couleurs de fond (bandeau, filigrane) sont imprimées. */}
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .receipt-sheet, .receipt-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .receipt-sheet { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Filigrane : le logo de l'école, grand, en diagonale et très pâle, derrière tout le contenu. Le contenu n'a volontairement aucun z-index :
          il ne crée pas de contexte d'empilement, donc le cachet se fond dans le filigrane (mix-blend-multiply) au lieu
          d'y poser un carré blanc. */}
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- logo de l'école recadré côté navigateur
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-[104%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] select-none object-contain opacity-[0.09] print:w-[560px]"
        />
      )}

      {cancelled && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <span className="-rotate-[22deg] rounded-2xl border-[6px] border-danger/60 px-6 py-2 font-display text-5xl font-bold uppercase tracking-widest text-danger/45">
            {t("receipt.cancelled")}
          </span>
        </div>
      )}

      {/* En-tête : identité de l'école et numéro du reçu. */}
      <header className="relative bg-gradient-to-br from-primary via-primary to-primary-dark px-5 pb-5 pt-5 text-white print:px-8 print:pb-4 print:pt-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo de l'école recadré côté navigateur
              <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <BrandMark className="h-full w-full rounded-xl" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-tight print:text-xl">{school?.nom ?? "Shakespeare Academy"}</p>
            {school?.adresse && <p className="mt-0.5 text-[11px] leading-snug text-white/75 print:text-xs">{school.adresse}</p>}
            {school?.telephone && <p className="text-[11px] leading-snug text-white/75 print:text-xs">{school.telephone}</p>}
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/20 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-soft/90">{t("receipt.title")}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tracking-wide">{props.numero}</p>
            {props.replacesNumber && <p className="text-[10px] text-white/70">{t("fin.receipt.replaces", { number: props.replacesNumber })}</p>}
          </div>
          <p className="text-right text-xs font-medium text-white/85">{props.dateLabel}</p>
        </div>
      </header>
      <div className="relative h-1 bg-gradient-to-r from-accent via-accent-dark to-accent" />

      <div className="relative px-5 pb-5 pt-4 print:px-8 print:pb-4 print:pt-4">
        {provisional && (
          <div className="mb-3 rounded-xl border-2 border-dashed border-warning bg-warning-soft/60 px-3 py-2 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-warning">{t("fin.prov.banner")}</p>
            <p className="text-[11px] text-ink-muted">{t("fin.prov.notOfficial")}</p>
          </div>
        )}
        {reprise && (
          <p className="mb-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/50 px-3 py-2 text-center text-xs text-ink-muted">
            {t("receipt.reprise")}
          </p>
        )}
        {cancelled?.motif && <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-center text-xs text-danger">{cancelled.motif}</p>}

        {/* Le montant, d'abord : c'est ce que la famille cherche sur son reçu. */}
        <section className="rounded-2xl border border-primary/15 bg-primary-soft/70 px-4 py-3.5 text-center print:py-3">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <BadgeCheck size={14} className="text-success" />
            {provisional ? t("receipt.amountPaid") : t("fin.receipt.paid")}
          </p>
          <p className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-primary print:text-[42px]">
            {formatMontant(total)}
          </p>
          <p className="mx-auto mt-2 max-w-[92%] text-[11px] italic leading-snug text-ink-muted">
            {t("receipt.inWords", { words: amountInWords(total, school?.devise) })}
          </p>
          {fee > 0 && (
            <p className="mt-1.5 text-[11px] font-medium text-ink">
              {t("receipt.tuitionPart")} : {formatMontant(props.montant)} · {t("receipt.serviceFee")} : {formatMontant(fee)}
            </p>
          )}
        </section>

        {/* Détail : toujours visible, sans rien à déplier. */}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm print:mt-3 print:gap-y-2">
          {props.student && (
            <>
              <Item label={t("receipt.student")} value={props.student.nom} wide />
              <Item label={t("receipt.studentId")} value={props.student.matricule} mono />
              <Item label={t("receipt.class")} value={props.student.classe} />
            </>
          )}
          <Item label={t("receipt.reason")} value={props.reason} wide />
          <Item label={t("receipt.method")} value={props.method} />
          {props.reference && <Item label={t("receipt.reference")} value={props.reference} mono wide={props.reference.length > 16} />}
          <Item label={t("fin.receipt.receivedBy")} value={props.cashier} />
        </dl>

        {/* Signature du caissier et cachet : posés automatiquement sur un reçu officiel. */}
        <div className="mt-5 grid grid-cols-2 gap-4 text-center print:mt-4 text-[11px] text-ink-muted">
          <SealSlot label={t("fin.receipt.cashierSignature")} src={seals ? props.signatureSrc : null} caption={seals && props.signatureSrc ? props.cashier : null} />
          <SealSlot label={t("fin.receipt.managementStamp")} src={seals ? props.cachetSrc : null} caption={null} />
        </div>

        <ParentSpaceCallout />

        <div className="mt-4 flex items-center gap-3 border-t border-dashed border-border pt-3.5 print:mt-3 print:pt-3">
          {props.verifyQr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, jamais une image next/image
            <img src={props.verifyQr} alt={t("fin.receipt.qrAlt")} className="h-[72px] w-[72px] shrink-0 rounded-lg border border-border bg-white p-1 print:h-[72px] print:w-[72px]" />
          ) : (
            <ShieldCheck size={28} className="shrink-0 text-ink-muted/50" />
          )}
          <div className="min-w-0 text-[11px] leading-snug text-ink-muted">
            {props.verifyQr && (
              <>
                <p className="font-semibold text-ink">{t("fin.receipt.verifiable")}</p>
                <p>{t("fin.receipt.scanHint")}</p>
              </>
            )}
            <p className={props.verifyQr ? "mt-1 text-[10px]" : ""}>{props.footer}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function Item({ label, value, wide, mono }: { label: string; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 break-words font-semibold text-ink ${mono ? "font-mono text-[13px]" : ""}`}>{value}</dd>
    </div>
  );
}

/** Emplacement d'une signature ou d'un cachet : l'image enregistrée si elle existe, sinon un espace pour le faire à la main. */
function SealSlot({ label, src, caption }: { label: string; src?: string | null; caption: string | null }) {
  const height = "h-[80px] print:h-[84px]";
  return (
    <div>
      <div className={`flex ${height} items-center justify-center border-b border-dashed border-border`}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- image privée lue avec le jeton, affichée depuis un blob local
          <img src={src} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
        )}
      </div>
      <p className="mt-1 font-medium">{label}</p>
      {caption && <p className="text-[10px] text-ink">{caption}</p>}
    </div>
  );
}
