"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { StudentPicker } from "@/components/discipline/student-picker";
import { ISSUE_LABEL, dateTimeLabel, studentName, type ConvocationView } from "@/lib/discipline";

function ConvocationForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [studentId, setStudentId] = useState("");
  const [dateRdv, setDateRdv] = useState("");
  const [lieu, setLieu] = useState("");
  const [objet, setObjet] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) return setError(t("acd.disc.conv.chooseStudent"));
    try {
      await api.post("/discipline/convocations", {
        studentId,
        dateRdv: new Date(dateRdv).toISOString(),
        lieu,
        objet,
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <Card className="mb-4 border-primary/40">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{t("acd.disc.conv.summonFamily")}</h2>
      <form onSubmit={submit} className="space-y-3">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("acd.disc.conv.dateTime")}>
            <Input type="datetime-local" required value={dateRdv} onChange={(e) => setDateRdv(e.target.value)} />
          </Field>
          <Field label={t("acd.disc.conv.place")}>
            <Input required maxLength={120} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder={t("acd.disc.conv.placePlaceholder")} />
          </Field>
          <Field label={t("acd.disc.conv.subject")}>
            <Input required maxLength={150} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder={t("acd.disc.conv.subjectPlaceholder")} />
          </Field>
        </div>
        <p className="text-xs text-ink-muted">{t("acd.disc.conv.note")}</p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex gap-2">
          <Button type="submit">{t("acd.disc.conv.send")}</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("acd.disc.conv.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Convocations des familles : création, annulation avec motif, issue du rendez-vous, accusé de réception du parent. */
export function ConvocationsPanel({ canConvoke }: { canConvoke: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ConvocationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<ConvocationView[]>("/discipline/convocations"));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body: object) {
    setError(null);
    try {
      await api.post(path, body);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      {canConvoke && !creating && (
        <div className="mb-3">
          <Button onClick={() => setCreating(true)}>{t("acd.disc.conv.summonFamily")}</Button>
        </div>
      )}
      {creating && (
        <ConvocationForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {rows && rows.length === 0 && <EmptyState title={t("acd.disc.conv.emptyTitle")} description={t("acd.disc.conv.emptyDesc")} />}
      <div className="space-y-3">
        {rows?.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{c.eleve ? studentName(c.eleve) : t("acd.disc.conv.studentFallback")}</p>
                <p className="text-sm text-ink">
                  {dateTimeLabel(c.dateRdv)} · {c.lieu}
                </p>
                <p className="text-sm text-ink-muted">{c.objet}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.statut === "ANNULEE" ? <Badge color="gray">{t("acd.disc.conv.cancelled")}</Badge> : <Badge color="blue">{t("acd.disc.conv.sent")}</Badge>}
                {c.statut === "ENVOYEE" && (
                  <Badge color={c.accuseLe ? "green" : "orange"}>{c.accuseLe ? t("acd.disc.conv.read") : t("acd.disc.conv.unread")}</Badge>
                )}
                {c.issue && <Badge color={c.issue === "PRESENT" ? "green" : "red"}>{ISSUE_LABEL[c.issue]}</Badge>}
              </div>
            </div>
            {c.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{t("acd.disc.conv.cancelledReason", { reason: c.motifAnnulation })}</p>}
            {canConvoke && c.statut === "ENVOYEE" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!c.issue && (
                  <>
                    <Button variant="secondary" onClick={() => void act(`/discipline/convocations/${c.id}/issue`, { issue: "PRESENT" })}>
                      {ISSUE_LABEL.PRESENT}
                    </Button>
                    <Button variant="secondary" onClick={() => void act(`/discipline/convocations/${c.id}/issue`, { issue: "ABSENT" })}>
                      {ISSUE_LABEL.ABSENT}
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const motif = prompt(t("acd.disc.conv.promptCancel"));
                    if (motif) void act(`/discipline/convocations/${c.id}/annuler`, { motif });
                  }}
                >
                  {t("acd.disc.conv.cancel")}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
