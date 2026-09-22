"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { RecordsPanel } from "@/components/discipline/records-panel";
import { SANCTION_COLOR, SANCTION_LABEL, dayLabel, studentName, type PendingSanction } from "@/lib/discipline";

/** Ce que la Direction doit traiter : sanctions décidées à publier à la famille, et incidents encore ouverts. */
export function TodoPanel({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [pending, setPending] = useState<PendingSanction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPending(await api.get<PendingSanction[]>("/discipline/sanctions?statut=DECIDEE"));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  async function publish(s: PendingSanction) {
    if (!confirm(`Publier cette sanction à la famille de ${studentName(s.eleve)} ? Elle sera visible dans l'espace parents et le parent sera prévenu.`)) return;
    setError(null);
    try {
      await api.post(`/discipline/sanctions/${s.id}/publier`);
      onChanged();
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function cancel(s: PendingSanction) {
    const motif = prompt("Motif de l'annulation de la sanction :");
    if (!motif) return;
    setError(null);
    try {
      await api.post(`/discipline/sanctions/${s.id}/annuler`, { motif });
      onChanged();
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-ink">Sanctions à publier</h2>
        <ErrorMessage>{error}</ErrorMessage>
        {pending && pending.length === 0 && <EmptyState title="Aucune sanction en attente" description="Les sanctions décidées mais pas encore publiées apparaissent ici." />}
        <div className="space-y-3">
          {pending?.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {studentName(s.eleve)} <span className="font-normal text-ink-muted">· {s.classe}</span>
                  </p>
                  <p className="text-sm text-ink">
                    {s.type}, du {dayLabel(s.dateDebut)}
                    {s.dateFin ? ` au ${dayLabel(s.dateFin)}` : ""} · faits du {dayLabel(s.dateFaits)}
                  </p>
                  {s.messageFamille && <p className="mt-1 text-xs text-ink-muted">Message à la famille : {s.messageFamille}</p>}
                </div>
                <Badge color={SANCTION_COLOR[s.statut]}>{SANCTION_LABEL[s.statut]}</Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void publish(s)}>Publier à la famille</Button>
                <Button variant="secondary" onClick={() => void cancel(s)}>
                  Annuler
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-ink">Incidents ouverts</h2>
        <RecordsPanel canDecide showAuthor fixedNature="INCIDENT" fixedStatut="OUVERT" version={version} onChanged={onChanged} />
      </section>
    </div>
  );
}
