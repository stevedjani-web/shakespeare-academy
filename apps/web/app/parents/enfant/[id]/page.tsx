"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpenText, CalendarDays, FileText, GraduationCap, ShieldAlert, Wallet, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { formatIso, shiftWeek } from "@/components/emploi-du-temps/shared";
import { formatMontant, weekdayName } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { ParentBulletinsTab } from "@/components/parents/bulletins-tab";
import { ParentTextbookTab } from "@/components/parents/textbook-tab";
import { PayTranches, type PayableTranche } from "@/components/parents/pay-tranche";
import { ParentDocumentsTab } from "@/components/parents/documents-tab";
import { ParentDisciplineTab } from "@/components/parents/discipline-tab";

type Tab = "emploi" | "absences" | "finances" | "bulletins" | "devoirs" | "discipline" | "documents";

interface Timetable {
  classe: string | null;
  debut: string;
  fin: string;
  jours: Array<{
    date: string;
    sansClasse: { libelle: string } | null;
    seances: Array<{ heureDebut: string; heureFin: string; matiere: string; enseignant: string; salle: string; statut: string }>;
  }>;
}

interface Attendance {
  compteurs: { seancesAppelees: number; absences: number; retards: number; excusees: number; nonJustifiees: number };
  lignes: Array<{
    date: string;
    heureDebut: string;
    heureFin: string;
    matiere: string;
    statut: "ABSENT" | "RETARD";
    minutesRetard: number | null;
    justificatif: { statut: "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE"; motif: string | null; commentaire: string | null } | null;
  }>;
}

interface Finance {
  // Paiement en ligne activé par l'école (et fournisseur configuré) : sinon aucune tranche n'est proposée à payer.
  paiementEnLigne: boolean;
  tranches: PayableTranche[];
  situation: {
    statut: "SOLVABLE" | "A_ECHOIR" | "EN_RETARD" | "IMPAYE_CRITIQUE" | "EXONERE";
    montantFacture: number;
    montantRemise: number;
    montantPaye: number;
    montantRestant: number;
    montantExigible: number;
    montantAEchoir: number;
    prochaineEcheance: { libelle: string; montant: number; dateLimite: string; enRetard: boolean } | null;
    lignesEnRetard: Array<{ libelle: string; montant: number; dateLimite: string }>;
  };
  paiements: Array<{ id: string; numeroRecu: string; montant: number; modePaiement: string; statut: "VALIDE" | "ANNULE"; date: string; libelle: string }>;
}

// Libellés pensés pour un parent : jamais « impayé critique », un seul mot clair pour un retard.
const FINANCE_STATUS: Record<Finance["situation"]["statut"], { key: MessageKey; color: "green" | "blue" | "orange" | "slate" }> = {
  SOLVABLE: { key: "parent.child.finUpToDate", color: "green" },
  A_ECHOIR: { key: "parent.child.finUpcoming", color: "blue" },
  EN_RETARD: { key: "parent.child.finLate", color: "orange" },
  IMPAYE_CRITIQUE: { key: "parent.child.finLate", color: "orange" },
  EXONERE: { key: "parent.child.finExempt", color: "slate" },
};

const SESSION_STATUS: Record<string, { key: MessageKey; color: "red" | "orange" | "blue" } | undefined> = {
  ANNULEE: { key: "parent.child.sessionCancelled", color: "red" },
  REMPLACEE: { key: "parent.child.sessionSubstitute", color: "orange" },
  SALLE_MODIFIEE: { key: "parent.child.sessionRoomChanged", color: "blue" },
};

const MODE_KEY: Record<string, MessageKey> = {
  ESPECES: "parent.child.modeCash",
  MOBILE_MONEY: "parent.child.modeMobile",
  VIREMENT: "parent.child.modeTransfer",
  CHEQUE: "parent.child.modeCheque",
};

export default function ChildPage() {
  const { id } = useParams<{ id: string }>();
  const { parent, loading } = useParent();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("emploi");
  const [date, setDate] = useState<string | undefined>(undefined);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const loadTimetable = useCallback(async () => {
    try {
      setTimetable(await portalApi.get<Timetable>(`/portal/children/${id}/timetable${date ? `?date=${date}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, [id, date]);

  useEffect(() => {
    if (!parent) return;
    if (tab === "emploi") void loadTimetable();
    if (tab === "absences" && !attendance) {
      void portalApi
        .get<Attendance>(`/portal/children/${id}/attendance`)
        .then((d) => {
          setAttendance(d);
          setError(null);
        })
        .catch((e) => setError(describePortalError(e)));
    }
    if (tab === "finances" && !finance) {
      void portalApi
        .get<Finance>(`/portal/children/${id}/finance`)
        .then((d) => {
          setFinance(d);
          setError(null);
        })
        .catch((e) => setError(describePortalError(e)));
    }
  }, [parent, tab, id, loadTimetable, attendance, finance]);

  // Recharge la situation financière après un paiement (le solde, les reçus et les tranches changent).
  const reloadFinance = useCallback(() => {
    void portalApi
      .get<Finance>(`/portal/children/${id}/finance`)
      .then(setFinance)
      .catch((e) => setError(describePortalError(e)));
  }, [id]);

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  const tabs = [
    { key: "emploi" as const, label: t("parent.child.tabTimetable"), icon: CalendarDays },
    { key: "devoirs" as const, label: t("parent.child.tabHomework"), icon: BookOpenText },
    { key: "absences" as const, label: t("parent.child.tabAbsences"), icon: UserX },
    { key: "bulletins" as const, label: t("parent.child.tabReportCards"), icon: GraduationCap },
    { key: "finances" as const, label: t("parent.child.tabFees"), icon: Wallet },
    { key: "discipline" as const, label: t("parent.child.tabSchoolLife"), icon: ShieldAlert },
    { key: "documents" as const, label: t("parent.child.tabDocuments"), icon: FileText },
  ];

  return (
    <div>
      <Link href="/parents" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline">
        <ArrowLeft size={14} /> {t("parent.nav.myChildren")}
      </Link>
      <PageTitle>{tab === "emploi" && timetable?.classe ? t("parent.child.titleClass", { name: timetable.classe }) : t("parent.child.titleChild")}</PageTitle>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage>{error}</ErrorMessage>

      {tab === "bulletins" && <ParentBulletinsTab studentId={id} />}
      {tab === "devoirs" && <ParentTextbookTab studentId={id} />}
      {tab === "discipline" && <ParentDisciplineTab studentId={id} />}
      {tab === "documents" && <ParentDocumentsTab studentId={id} />}

      {tab === "emploi" && (
        <div>
          {timetable && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button variant="secondary" aria-label={t("parent.child.prevWeek")} onClick={() => setDate(shiftWeek(timetable.debut, -7))}>
                <ChevronLeft size={16} />
              </Button>
              <p className="text-sm font-medium text-ink">{t("parent.child.weekOf", { from: formatIso(timetable.debut), to: formatIso(timetable.fin) })}</p>
              <Button variant="secondary" aria-label={t("parent.child.nextWeek")} onClick={() => setDate(shiftWeek(timetable.debut, 7))}>
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
          {!timetable && !error && <Spinner />}
          {timetable && timetable.jours.length === 0 && <p className="text-sm text-ink-muted">{t("parent.child.noClassThisYear")}</p>}
          <div className="space-y-3">
            {timetable?.jours.map((j) => (
              <section key={j.date} className="rounded-2xl border border-border bg-surface p-3">
                <h3 className="mb-2 flex flex-wrap items-center gap-2 font-display text-base font-semibold text-ink">
                  {weekdayName(j.date, locale)} {formatIso(j.date)}
                  {j.sansClasse && <Badge color="gray">{j.sansClasse.libelle}</Badge>}
                </h3>
                {j.seances.length === 0 ? (
                  <p className="text-sm text-ink-muted">{j.sansClasse ? t("parent.child.noLessonsToday") : t("parent.child.noSessions")}</p>
                ) : (
                  <ul className="space-y-2">
                    {j.seances.map((s, i) => {
                      const st = SESSION_STATUS[s.statut];
                      return (
                        <li key={i} className={`rounded-xl border border-border p-2.5 ${s.statut === "ANNULEE" ? "opacity-70" : ""}`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className={`font-medium text-ink ${s.statut === "ANNULEE" ? "line-through" : ""}`}>
                                {s.heureDebut} - {s.heureFin} · {s.matiere}
                              </p>
                              <p className="text-sm text-ink-muted">
                                {s.enseignant} · {s.salle}
                              </p>
                            </div>
                            {st && <Badge color={st.color}>{t(st.key)}</Badge>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === "absences" && (
        <div>
          {!attendance && !error && <Spinner />}
          {attendance && (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <Badge color="red">{t("parent.child.absencesCount", { n: attendance.compteurs.absences })}</Badge>
                <Badge color="orange">{t("parent.child.lateCount", { n: attendance.compteurs.retards })}</Badge>
                <Badge color="green">{t("parent.child.excusedCount", { n: attendance.compteurs.excusees })}</Badge>
                <Badge color="blue">{t("parent.child.unjustifiedCount", { n: attendance.compteurs.nonJustifiees })}</Badge>
              </div>
              {attendance.lignes.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("parent.child.noAbsences")}</p>
              ) : (
                <ul className="space-y-2">
                  {attendance.lignes.map((l, i) => (
                    <li key={i} className="rounded-2xl border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink">
                            {formatIso(l.date)} · {l.heureDebut} - {l.heureFin}
                          </p>
                          <p className="text-sm text-ink-muted">{l.matiere}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge color={l.statut === "ABSENT" ? "red" : "orange"}>
                            {l.statut === "ABSENT" ? t("parent.child.absent") : l.minutesRetard ? t("parent.child.lateMinutes", { min: l.minutesRetard }) : t("parent.child.late")}
                          </Badge>
                          <Badge color={l.justificatif?.statut === "ACCEPTEE" ? "green" : l.justificatif?.statut === "REFUSEE" ? "red" : l.justificatif ? "blue" : "gray"}>
                            {l.justificatif
                              ? l.justificatif.statut === "ACCEPTEE"
                                ? t("parent.child.excused")
                                : l.justificatif.statut === "REFUSEE"
                                  ? t("parent.child.noteRefused")
                                  : t("parent.child.noteReview")
                              : t("parent.child.notJustified")}
                          </Badge>
                        </div>
                      </div>
                      {l.justificatif?.motif && <p className="mt-1 text-xs text-ink-muted">{t("parent.child.reason", { reason: l.justificatif.motif })}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-ink-muted">{t("parent.child.howToJustify")}</p>
            </>
          )}
        </div>
      )}

      {tab === "finances" && (
        <div>
          {!finance && !error && <Spinner />}
          {finance && (
            <>
              <Card className="mb-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge color={FINANCE_STATUS[finance.situation.statut].color}>{t(FINANCE_STATUS[finance.situation.statut].key)}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-ink-muted">{t("parent.child.finInvoiced")}</dt>
                    <dd className="font-medium text-ink">{formatMontant(finance.situation.montantFacture)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">{t("parent.child.finPaid")}</dt>
                    <dd className="font-medium text-success">{formatMontant(finance.situation.montantPaye)}</dd>
                  </div>
                  {finance.situation.montantRemise > 0 && (
                    <div>
                      <dt className="text-ink-muted">{t("parent.child.finDiscounts")}</dt>
                      <dd className="font-medium text-ink">{formatMontant(finance.situation.montantRemise)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-muted">{t("parent.child.finRemaining")}</dt>
                    <dd className="font-medium text-ink">{formatMontant(finance.situation.montantRestant)}</dd>
                  </div>
                </dl>
                {finance.situation.prochaineEcheance && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${finance.situation.prochaineEcheance.enRetard ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>
                    {finance.situation.prochaineEcheance.enRetard ? t("parent.child.finOverdue") : t("parent.child.finNextDue")}
                    {t("parent.child.finDueLine", {
                      label: finance.situation.prochaineEcheance.libelle,
                      amount: formatMontant(finance.situation.prochaineEcheance.montant),
                      date: formatIso(finance.situation.prochaineEcheance.dateLimite.slice(0, 10)),
                    })}
                  </p>
                )}
              </Card>

              {finance.paiementEnLigne && (
                <PayTranches studentId={id} tranches={finance.tranches} defaultPhone={parent.telephone} onChanged={reloadFinance} />
              )}

              <h2 className="mb-2 font-display text-base font-semibold text-ink">{t("parent.child.finPayments")}</h2>
              {finance.paiements.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("parent.child.finNoPayments")}</p>
              ) : (
                <ul className="space-y-2">
                  {finance.paiements.map((p) => (
                    <li key={p.id} className={`rounded-2xl border border-border bg-surface p-3 ${p.statut === "ANNULE" ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className={`font-medium text-ink ${p.statut === "ANNULE" ? "line-through" : ""}`}>{formatMontant(p.montant)}</p>
                          <p className="text-sm text-ink-muted">
                            {p.libelle} · {formatIso(p.date.slice(0, 10))} · {MODE_KEY[p.modePaiement] ? t(MODE_KEY[p.modePaiement]) : p.modePaiement}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs text-ink-muted">{t("parent.child.finReceipt", { number: p.numeroRecu })}</p>
                          {p.statut === "ANNULE" && <Badge color="red">{t("parent.child.finCancelled")}</Badge>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
