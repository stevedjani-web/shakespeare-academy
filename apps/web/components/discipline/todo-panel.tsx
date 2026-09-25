"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { RecordsPanel } from "@/components/discipline/records-panel";
import { SANCTION_COLOR, SANCTION_LABEL, dayLabel, studentName, type PendingSanction } from "@/lib/discipline";

/** Ce que la Direction doit traiter : sanctions décidées à publier à la famille, et incidents encore ouverts. */
export function TodoPanel({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { t } = useI18n();
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
    if (!confirm(t("acd.disc.todo.confirmPublish", { name: studentName(s.eleve) }))) return;
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
    const motif = prompt(t("acd.disc.todo.promptCancel"));
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
        <h2 className="mb-2 font-display text-base font-semibold text-ink">{t("acd.disc.todo.toPublish")}</h2>
        <ErrorMessage>{error}</ErrorMessage>
        {pending && pending.length === 0 && <EmptyState title={t("acd.disc.todo.emptyTitle")} description={t("acd.disc.todo.emptyDesc")} />}
        <div className="space-y-3">
          {pending?.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {studentName(s.eleve)} <span className="font-normal text-ink-muted">· {s.classe}</span>
                  </p>
                  <p className="text-sm text-ink">
                    {s.dateFin
                      ? t("acd.disc.todo.lineTo", { type: s.type, start: dayLabel(s.dateDebut), end: dayLabel(s.dateFin), facts: dayLabel(s.dateFaits) })
                      : t("acd.disc.todo.line", { type: s.type, start: dayLabel(s.dateDebut), facts: dayLabel(s.dateFaits) })}
                  </p>
                  {s.messageFamille && <p className="mt-1 text-xs text-ink-muted">{t("acd.disc.todo.messageToFamily", { message: s.messageFamille })}</p>}
                </div>
                <Badge color={SANCTION_COLOR[s.statut]}>{SANCTION_LABEL[s.statut]}</Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void publish(s)}>{t("acd.disc.todo.publish")}</Button>
                <Button variant="secondary" onClick={() => void cancel(s)}>
                  {t("acd.disc.todo.cancel")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-ink">{t("acd.disc.todo.openIncidents")}</h2>
        <RecordsPanel canDecide showAuthor fixedNature="INCIDENT" fixedStatut="OUVERT" version={version} onChanged={onChanged} />
      </section>
    </div>
  );
}
