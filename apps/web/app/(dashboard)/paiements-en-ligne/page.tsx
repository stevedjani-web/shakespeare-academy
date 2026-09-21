"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatMontant } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorMessage, Input, PageTitle, Select, SuccessMessage } from "@/components/ui";

type Statut = "EN_ATTENTE" | "CONFIRME" | "ECHOUE" | "A_TRAITER";

interface OnlinePaymentRow {
  id: string;
  statut: Statut;
  montant: number;
  telephone: string;
  motifEchec: string | null;
  motifCloture: string | null;
  cloture: boolean;
  createdAt: string;
  tranche: string;
  eleve: { id: string; nom: string; prenom: string; matricule: string };
  responsable: { nom: string; prenom: string; telephone: string };
  paiement: { id: string; numeroRecu: string } | null;
}

const STATUT: Record<Statut, { label: string; color: "blue" | "green" | "red" | "orange" }> = {
  EN_ATTENTE: { label: "En attente", color: "blue" },
  CONFIRME: { label: "Confirmé", color: "green" },
  ECHOUE: { label: "Échoué", color: "red" },
  A_TRAITER: { label: "À traiter", color: "orange" },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Suivi des paiements faits par les parents : vérifier une tentative en attente, clôturer un paiement sans solde à imputer. */
export default function OnlinePaymentsPage() {
  const { hasPermission } = useAuth();
  const canResolve = hasPermission("PAYMENT_CANCEL_APPROVE");
  const [rows, setRows] = useState<OnlinePaymentRow[]>([]);
  const [filter, setFilter] = useState<"" | Statut>("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await api.get<OnlinePaymentRow[]>(`/online-payments${filter ? `?statut=${filter}` : ""}`));
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setLoaded(true);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile(id: string) {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const res = await api.post<{ statut: Statut }>(`/online-payments/${id}/reconcile`, {});
      setNotice(res.statut === "EN_ATTENTE" ? "Toujours en attente chez l'opérateur." : `État mis à jour : ${STATUT[res.statut].label.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: string) {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      await api.post(`/online-payments/${id}/resolve`, { motif });
      setResolving(null);
      setMotif("");
      setNotice("Paiement clôturé.");
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setBusyId(null);
    }
  }

  const toTreat = rows.filter((r) => r.statut === "A_TRAITER" && !r.cloture).length;

  return (
    <div>
      <PageTitle subtitle="Les paiements de scolarité faits par les parents par Mobile Money.">Paiements en ligne</PageTitle>

      {toTreat > 0 && (
        <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {toTreat} paiement{toTreat > 1 ? "s" : ""} reçu{toTreat > 1 ? "s" : ""} sans solde à imputer : le parent a payé une tranche déjà réglée. Rembourser
          le parent (hors de l&apos;application) puis clôturer avec un motif.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "" | Statut)} aria-label="Filtrer par état">
            <option value="">Tous les états</option>
            {(Object.keys(STATUT) as Statut[]).map((s) => (
              <option key={s} value={s}>
                {STATUT[s].label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Actualiser
        </Button>
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      <SuccessMessage>{notice}</SuccessMessage>

      {loaded && rows.length === 0 && <EmptyState title="Aucun paiement en ligne" description="Les paiements faits par les parents apparaîtront ici." />}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {r.eleve.prenom} {r.eleve.nom} <span className="text-xs text-ink-muted">({r.eleve.matricule})</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {r.tranche} · {formatMontant(r.montant)} · {when(r.createdAt)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Payé par {r.responsable.prenom} {r.responsable.nom}, numéro débité {r.telephone}
                  </p>
                </div>
                <Badge color={r.cloture ? "slate" : STATUT[r.statut].color}>{r.cloture ? "Clôturé" : STATUT[r.statut].label}</Badge>
              </div>

              {r.statut === "CONFIRME" && r.paiement && (
                <p className="mt-2 text-sm">
                  Reçu{" "}
                  <Link className="font-mono text-primary hover:underline" href={`/recus/${r.paiement.id}`}>
                    {r.paiement.numeroRecu}
                  </Link>
                </p>
              )}
              {r.statut === "ECHOUE" && r.motifEchec && <p className="mt-2 text-sm text-ink-muted">{r.motifEchec}</p>}
              {r.cloture && r.motifCloture && <p className="mt-2 text-sm text-ink-muted">Motif de clôture : {r.motifCloture}</p>}

              {r.statut === "EN_ATTENTE" && (
                <div className="mt-3">
                  <Button variant="secondary" disabled={busyId === r.id} onClick={() => void reconcile(r.id)}>
                    {busyId === r.id ? "Vérification…" : "Vérifier auprès de l'opérateur"}
                  </Button>
                </div>
              )}

              {r.statut === "A_TRAITER" && !r.cloture && canResolve && (
                <div className="mt-3">
                  {resolving === r.id ? (
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void resolve(r.id);
                      }}
                    >
                      <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (par exemple : remboursé au parent le 12/10)" required minLength={3} />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={busyId === r.id}>
                          Clôturer
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setResolving(null)}>
                          Annuler
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="secondary" onClick={() => setResolving(r.id)}>
                      Clôturer
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
