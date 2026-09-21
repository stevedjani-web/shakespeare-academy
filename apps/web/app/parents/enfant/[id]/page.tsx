"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Wallet, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { WEEK_DAYS } from "@/components/vie-scolaire/shared";
import { formatIso, shiftWeek } from "@/components/emploi-du-temps/shared";
import { formatMontant } from "@/lib/format";

type Tab = "emploi" | "absences" | "finances";

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
const FINANCE_STATUS: Record<Finance["situation"]["statut"], { label: string; color: "green" | "blue" | "orange" | "slate" }> = {
  SOLVABLE: { label: "À jour", color: "green" },
  A_ECHOIR: { label: "Échéance à venir", color: "blue" },
  EN_RETARD: { label: "Paiement en retard", color: "orange" },
  IMPAYE_CRITIQUE: { label: "Paiement en retard", color: "orange" },
  EXONERE: { label: "Exonéré", color: "slate" },
};

const SESSION_STATUS: Record<string, { label: string; color: "red" | "orange" | "blue" } | undefined> = {
  ANNULEE: { label: "Annulée", color: "red" },
  REMPLACEE: { label: "Enseignant remplaçant", color: "orange" },
  SALLE_MODIFIEE: { label: "Salle changée", color: "blue" },
};

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money", VIREMENT: "Virement", CHEQUE: "Chèque" };

function dayName(iso: string): string {
  return WEEK_DAYS.find((d) => d.value === new Date(`${iso}T00:00:00Z`).getUTCDay())?.label ?? "";
}

export default function ChildPage() {
  const { id } = useParams<{ id: string }>();
  const { parent, loading } = useParent();
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

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  const tabs = [
    { key: "emploi" as const, label: "Emploi du temps", icon: CalendarDays },
    { key: "absences" as const, label: "Absences", icon: UserX },
    { key: "finances" as const, label: "Finances", icon: Wallet },
  ];

  return (
    <div>
      <Link href="/parents" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline">
        <ArrowLeft size={14} /> Mes enfants
      </Link>
      <PageTitle>{tab === "emploi" && timetable?.classe ? `Classe ${timetable.classe}` : "Mon enfant"}</PageTitle>

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

      {tab === "emploi" && (
        <div>
          {timetable && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <Button variant="secondary" aria-label="Semaine précédente" onClick={() => setDate(shiftWeek(timetable.debut, -7))}>
                <ChevronLeft size={16} />
              </Button>
              <p className="text-sm font-medium text-ink">
                Semaine du {formatIso(timetable.debut)} au {formatIso(timetable.fin)}
              </p>
              <Button variant="secondary" aria-label="Semaine suivante" onClick={() => setDate(shiftWeek(timetable.debut, 7))}>
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
          {!timetable && !error && <Spinner />}
          {timetable && timetable.jours.length === 0 && <p className="text-sm text-ink-muted">Aucune classe cette année pour cet enfant.</p>}
          <div className="space-y-3">
            {timetable?.jours.map((j) => (
              <section key={j.date} className="rounded-2xl border border-border bg-surface p-3">
                <h3 className="mb-2 flex flex-wrap items-center gap-2 font-display text-base font-semibold text-ink">
                  {dayName(j.date)} {formatIso(j.date)}
                  {j.sansClasse && <Badge color="gray">{j.sansClasse.libelle}</Badge>}
                </h3>
                {j.seances.length === 0 ? (
                  <p className="text-sm text-ink-muted">{j.sansClasse ? "Pas de cours ce jour." : "Aucune séance."}</p>
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
                            {st && <Badge color={st.color}>{st.label}</Badge>}
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
                <Badge color="red">{attendance.compteurs.absences} absence(s)</Badge>
                <Badge color="orange">{attendance.compteurs.retards} retard(s)</Badge>
                <Badge color="green">{attendance.compteurs.excusees} excusée(s)</Badge>
                <Badge color="blue">{attendance.compteurs.nonJustifiees} non justifiée(s)</Badge>
              </div>
              {attendance.lignes.length === 0 ? (
                <p className="text-sm text-ink-muted">Aucune absence ni aucun retard enregistré.</p>
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
                          <Badge color={l.statut === "ABSENT" ? "red" : "orange"}>{l.statut === "ABSENT" ? "Absent" : `Retard${l.minutesRetard ? ` ${l.minutesRetard} min` : ""}`}</Badge>
                          <Badge color={l.justificatif?.statut === "ACCEPTEE" ? "green" : l.justificatif?.statut === "REFUSEE" ? "red" : l.justificatif ? "blue" : "gray"}>
                            {l.justificatif ? (l.justificatif.statut === "ACCEPTEE" ? "Excusée" : l.justificatif.statut === "REFUSEE" ? "Justificatif refusé" : "Justificatif en cours d'examen") : "Non justifiée"}
                          </Badge>
                        </div>
                      </div>
                      {l.justificatif?.motif && <p className="mt-1 text-xs text-ink-muted">Motif : {l.justificatif.motif}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-ink-muted">Pour justifier une absence, remettez un mot au secrétariat de l&apos;école.</p>
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
                  <Badge color={FINANCE_STATUS[finance.situation.statut].color}>{FINANCE_STATUS[finance.situation.statut].label}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-ink-muted">Facturé</dt>
                    <dd className="font-medium text-ink">{formatMontant(finance.situation.montantFacture)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Déjà payé</dt>
                    <dd className="font-medium text-success">{formatMontant(finance.situation.montantPaye)}</dd>
                  </div>
                  {finance.situation.montantRemise > 0 && (
                    <div>
                      <dt className="text-ink-muted">Remises</dt>
                      <dd className="font-medium text-ink">{formatMontant(finance.situation.montantRemise)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-muted">Reste à payer</dt>
                    <dd className="font-medium text-ink">{formatMontant(finance.situation.montantRestant)}</dd>
                  </div>
                </dl>
                {finance.situation.prochaineEcheance && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${finance.situation.prochaineEcheance.enRetard ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>
                    {finance.situation.prochaineEcheance.enRetard ? "En retard : " : "Prochaine échéance : "}
                    {finance.situation.prochaineEcheance.libelle}, {formatMontant(finance.situation.prochaineEcheance.montant)}, avant le {formatIso(finance.situation.prochaineEcheance.dateLimite.slice(0, 10))}.
                  </p>
                )}
              </Card>

              <h2 className="mb-2 font-display text-base font-semibold text-ink">Paiements et reçus</h2>
              {finance.paiements.length === 0 ? (
                <p className="text-sm text-ink-muted">Aucun paiement enregistré.</p>
              ) : (
                <ul className="space-y-2">
                  {finance.paiements.map((p) => (
                    <li key={p.id} className={`rounded-2xl border border-border bg-surface p-3 ${p.statut === "ANNULE" ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className={`font-medium text-ink ${p.statut === "ANNULE" ? "line-through" : ""}`}>{formatMontant(p.montant)}</p>
                          <p className="text-sm text-ink-muted">
                            {p.libelle} · {formatIso(p.date.slice(0, 10))} · {MODE_LABEL[p.modePaiement] ?? p.modePaiement}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs text-ink-muted">Reçu {p.numeroRecu}</p>
                          {p.statut === "ANNULE" && <Badge color="red">Annulé</Badge>}
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
