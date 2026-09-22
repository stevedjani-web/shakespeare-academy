"use client";

import { useCallback, useEffect, useState } from "react";
import { portalApi, describePortalError } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, Spinner } from "@/components/ui";
import { dateTimeLabel, dayLabel } from "@/lib/discipline";

interface View {
  sanctions: Array<{ id: string; type: string; dateDebut: string; dateFin: string | null; message: string | null; retiree: boolean }>;
  convocations: Array<{ id: string; dateRdv: string; lieu: string; objet: string; annulee: boolean; accuseLe: string | null; issue: "PRESENT" | "ABSENT" | null }>;
  valorisations: Array<{ id: string; type: string; date: string }>;
}

/**
 * Vie scolaire de l'enfant : sanctions publiées par la Direction, convocations, points positifs. Le récit des faits, le
 * nom de l'enseignant et les autres élèves ne sont jamais affichés ici.
 */
export function ParentDisciplineTab({ studentId }: { studentId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await portalApi.get<View>(`/portal/children/${studentId}/discipline`));
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge(convocationId: string) {
    setError(null);
    try {
      await portalApi.post(`/portal/children/${studentId}/discipline/convocations/${convocationId}/accuser`);
      await load();
    } catch (err) {
      setError(describePortalError(err));
    }
  }

  if (!view && !error) return <Spinner />;
  if (!view) return <ErrorMessage>{error}</ErrorMessage>;
  const empty = view.sanctions.length === 0 && view.convocations.length === 0 && view.valorisations.length === 0;

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>
      {empty && <p className="text-sm text-ink-muted">Rien à signaler : aucune sanction, convocation ni valorisation pour le moment.</p>}

      {view.convocations.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">Convocations</h2>
          <div className="space-y-2">
            {view.convocations.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{dateTimeLabel(c.dateRdv)}</p>
                    <p className="text-sm text-ink">{c.lieu}</p>
                    <p className="text-sm text-ink-muted">{c.objet}</p>
                  </div>
                  {c.annulee ? <Badge color="gray">Annulée</Badge> : c.accuseLe ? <Badge color="green">Vous avez pris connaissance</Badge> : <Badge color="orange">À lire</Badge>}
                </div>
                {!c.annulee && !c.accuseLe && (
                  <Button className="mt-3" onClick={() => void acknowledge(c.id)}>
                    J&apos;ai pris connaissance
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {view.sanctions.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">Sanctions</h2>
          <div className="space-y-2">
            {view.sanctions.map((s) => (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{s.type}</p>
                    <p className="text-sm text-ink">
                      Du {dayLabel(s.dateDebut)}
                      {s.dateFin ? ` au ${dayLabel(s.dateFin)}` : ""}
                    </p>
                    {s.message && <p className="mt-1 text-sm text-ink-muted">{s.message}</p>}
                  </div>
                  {s.retiree && <Badge color="gray">Retirée par l&apos;école</Badge>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {view.valorisations.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">Points positifs</h2>
          <ul className="space-y-1.5 text-sm">
            {view.valorisations.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <span className="text-ink">{v.type}</span>
                <span className="text-ink-muted">{dayLabel(v.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
