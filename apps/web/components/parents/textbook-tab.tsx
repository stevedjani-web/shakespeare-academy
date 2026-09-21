"use client";

import { useEffect, useState } from "react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { frDay, frShort, type ParentTextbook, type ParentTextbookEntry } from "@/lib/textbook";
import { Badge, Card, ErrorMessage, Spinner } from "@/components/ui";

function Homework({ e }: { e: ParentTextbookEntry }) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{e.matiere}</p>
        {e.dateEcheance && <Badge color="orange">pour le {frShort(e.dateEcheance)}</Badge>}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{e.devoirs}</p>
      <p className="mt-1 text-xs text-ink-muted">
        Donné le {frShort(e.date)} par {e.enseignant}
      </p>
    </li>
  );
}

/** Le cahier de textes de la classe de l'enfant, en lecture seule : devoirs à rendre d'abord, puis les 14 derniers jours. */
export function ParentTextbookTab({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ParentTextbook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi
      .get<ParentTextbook>(`/portal/children/${studentId}/textbook`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(describePortalError(e)));
  }, [studentId]);

  // Les entrées du cahier regroupées par jour.
  const byDay = new Map<string, ParentTextbookEntry[]>();
  for (const e of data?.entrees ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="space-y-5">
      <ErrorMessage>{error}</ErrorMessage>
      {!data && !error && <Spinner />}
      {data && !data.classe && <p className="text-sm text-ink-muted">Cet enfant n&apos;est inscrit dans aucune classe pour l&apos;instant.</p>}
      {data?.classe && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Devoirs à rendre</h3>
            {data.aVenir.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucun devoir à rendre pour l&apos;instant.</p>
            ) : (
              <ul className="space-y-2">
                {data.aVenir.map((e) => (
                  <Homework key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Cahier de textes de la classe {data.classe}</h3>
            {byDay.size === 0 ? (
              <p className="text-sm text-ink-muted">Rien n&apos;a été noté ces 14 derniers jours.</p>
            ) : (
              <div className="space-y-3">
                {[...byDay.entries()].map(([day, entries]) => (
                  <Card key={day}>
                    <p className="mb-2 text-sm font-semibold text-primary">{frDay(day)}</p>
                    <ul className="space-y-2">
                      {entries.map((e) => (
                        <li key={e.id} className="text-sm text-ink">
                          <p className="font-medium">{e.matiere}</p>
                          {e.contenu && <p className="whitespace-pre-line text-ink-muted">{e.contenu}</p>}
                          {e.devoirs && (
                            <p className="mt-1 whitespace-pre-line">
                              <span className="font-medium">À faire : </span>
                              {e.devoirs}
                              {e.dateEcheance && ` (pour le ${frShort(e.dateEcheance)})`}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
