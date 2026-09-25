"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Button, Card, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { StudentPicker } from "@/components/discipline/student-picker";
import { GRAVITE_LABEL, type DisciplineGravite, type DisciplineNature, type DisciplineType } from "@/lib/discipline";

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Signalement d'un incident ou d'une valorisation. Le serveur refuse tout élève hors des classes d'un enseignant. */
export function ReportForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [types, setTypes] = useState<DisciplineType[]>([]);
  const [studentId, setStudentId] = useState("");
  const [nature, setNature] = useState<DisciplineNature>("INCIDENT");
  const [typeId, setTypeId] = useState("");
  const [gravite, setGravite] = useState<DisciplineGravite>("MOYEN");
  const [dateFaits, setDateFaits] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<DisciplineType[]>("/discipline/types").then(setTypes).catch(() => setTypes([]));
  }, []);

  const available = types.filter((ty) => ty.actif && ty.nature === nature);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) return setError(t("acd.disc.form.chooseStudent"));
    if (!typeId) return setError(t("acd.disc.form.chooseType"));
    setBusy(true);
    try {
      await api.post("/discipline/records", {
        studentId,
        nature,
        typeId,
        dateFaits,
        ...(nature === "INCIDENT" ? { gravite, description } : description.trim() ? { description } : {}),
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 border-primary/40">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{t("acd.disc.form.title")}</h2>
      <form onSubmit={submit} className="space-y-3">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("acd.disc.form.kind")}>
            <Select
              value={nature}
              onChange={(e) => {
                setNature(e.target.value as DisciplineNature);
                setTypeId("");
              }}
            >
              <option value="INCIDENT">{t("acd.disc.form.incident")}</option>
              <option value="VALORISATION">{t("acd.disc.form.commendation")}</option>
            </Select>
          </Field>
          <Field label={t("acd.disc.form.type")}>
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t("acd.disc.form.choose")}</option>
              {available.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {ty.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("acd.disc.form.date")}>
            <Input type="date" max={todayLocal()} value={dateFaits} onChange={(e) => setDateFaits(e.target.value)} />
          </Field>
        </div>
        {available.length === 0 && (
          <p className="text-xs text-ink-muted">{nature === "INCIDENT" ? t("acd.disc.form.noIncidentType") : t("acd.disc.form.noCommendationType")}</p>
        )}
        {nature === "INCIDENT" && (
          <Field label={t("acd.disc.form.severity")}>
            <Select value={gravite} onChange={(e) => setGravite(e.target.value as DisciplineGravite)}>
              <option value="LEGER">{GRAVITE_LABEL.LEGER}</option>
              <option value="MOYEN">{GRAVITE_LABEL.MOYEN}</option>
              <option value="GRAVE">{GRAVITE_LABEL.GRAVE}</option>
            </Select>
          </Field>
        )}
        <Field label={nature === "INCIDENT" ? t("acd.disc.form.descriptionIncident") : t("acd.disc.form.commentOptional")}>
          <textarea
            className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("acd.disc.form.descriptionPlaceholder")}
          />
        </Field>
        <p className="text-xs text-ink-muted">{t("acd.disc.form.confidential")}</p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("acd.disc.form.saving") : t("acd.disc.form.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("acd.disc.form.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
