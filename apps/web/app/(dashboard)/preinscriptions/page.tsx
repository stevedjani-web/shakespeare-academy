"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { ClassPicker } from "@/components/pre-registrations/class-picker";
import { STATUT_COLOR, STATUT_LABEL, dayLabel, studentName, type PreRegistrationStatus, type PreRegistrationView } from "@/lib/pre-registrations";

const TABS: Array<{ key: PreRegistrationStatus; label: string }> = [
  { key: "EN_ATTENTE", label: "En attente" },
  { key: "ACCEPTEE", label: "Acceptées" },
  { key: "REJETEE", label: "Refusées" },
];

function AcceptPanel({ row, onDone, onCancel }: { row: PreRegistrationView; onDone: () => void; onCancel: () => void }) {
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; nom: string; prenom: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(forcerCreation: boolean) {
    if (!classId) return setError("Choisissez la classe.");
    setError(null);
    setBusy(true);
    try {
      await api.post(`/preinscriptions/${row.id}/accepter`, { classId, ...(forcerCreation ? { forcerCreation: true } : {}) });
      onDone();
    } catch (err) {
      if (isApiError(err) && err.status === 409 && err.data && typeof err.data === "object" && "doublonPotentiel" in err.data) {
        setDuplicate((err.data as { doublonPotentiel: { id: string; nom: string; prenom: string } }).doublonPotentiel);
        setError(err.message);
      } else {
        setDuplicate(null);
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      <ClassPicker initialLevelId={row.niveau?.id} onChange={setClassId} />
      <ErrorMessage>{error}</ErrorMessage>
      {duplicate && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          Un élève très proche existe déjà ({duplicate.prenom} {duplicate.nom}). Confirmez si ce n&apos;est pas un doublon.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!duplicate ? (
          <Button onClick={() => void submit(false)} disabled={busy || !classId}>
            {busy ? "Enregistrement…" : "Accepter et inscrire"}
          </Button>
        ) : (
          <Button onClick={() => void submit(true)} disabled={busy}>
            {busy ? "Enregistrement…" : "Confirmer malgré le doublon"}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

/**
 * Examen des demandes de préinscription. Même droit que l'inscription manuelle (ENROLLMENT_MANAGE) : accepter revient
 * à choisir la classe réelle puis à créer l'élève et son inscription (les mêmes garde-fous s'appliquent, doublon compris).
 */
export default function PreRegistrationsPage() {
  const [tab, setTab] = useState<PreRegistrationStatus>("EN_ATTENTE");
  const [rows, setRows] = useState<PreRegistrationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PreRegistrationView[]>(`/preinscriptions?statut=${tab}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [tab]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  async function reject(row: PreRegistrationView) {
    const motif = prompt(`Motif du refus de la demande de ${studentName(row.eleve)} :`);
    if (!motif) return;
    setError(null);
    try {
      await api.post(`/preinscriptions/${row.id}/rejeter`, { motif });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow="Lot 21"
        subtitle="Demandes déposées par des familles sans compte. Accepter crée l'élève et son inscription réels."
      >
        Préinscriptions
      </PageTitle>

      <div className="mb-4 flex gap-1 rounded-full border border-border bg-surface-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {rows && rows.length === 0 && <EmptyState title="Aucune demande" description="Les demandes de préinscription apparaîtront ici." />}
      <div className="space-y-3">
        {rows?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  {studentName(r.eleve)} <span className="font-normal text-ink-muted">· {r.niveau?.nom ?? "Niveau supprimé"}</span>
                </p>
                <p className="text-sm text-ink-muted">
                  Né(e) le {dayLabel(r.eleve.dateNaissance)} · Référence {r.reference} · Déposée le {dayLabel(r.createdAt)}
                </p>
                <p className="text-sm text-ink">
                  Responsable : {r.responsable.prenom} {r.responsable.nom} · {r.responsable.telephone}
                  {r.responsable.email ? ` · ${r.responsable.email}` : ""}
                </p>
                {r.message && <p className="mt-1 text-sm text-ink-muted">« {r.message} »</p>}
                {r.motifRejet && <p className="mt-1 text-sm text-danger">Motif du refus : {r.motifRejet}</p>}
              </div>
              <Badge color={STATUT_COLOR[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
            </div>
            {r.statut === "EN_ATTENTE" && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => setAccepting(accepting === r.id ? null : r.id)}>Accepter</Button>
                  <Button variant="secondary" onClick={() => void reject(r)}>
                    Refuser
                  </Button>
                </div>
                {accepting === r.id && (
                  <AcceptPanel
                    row={r}
                    onCancel={() => setAccepting(null)}
                    onDone={() => {
                      setAccepting(null);
                      void load();
                    }}
                  />
                )}
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
