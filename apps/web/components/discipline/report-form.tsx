"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { StudentPicker } from "@/components/discipline/student-picker";
import type { DisciplineGravite, DisciplineNature, DisciplineType } from "@/lib/discipline";

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Signalement d'un incident ou d'une valorisation. Le serveur refuse tout élève hors des classes d'un enseignant. */
export function ReportForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
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

  const available = types.filter((t) => t.actif && t.nature === nature);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) return setError("Choisissez l'élève concerné.");
    if (!typeId) return setError("Choisissez un type de signalement.");
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
      <h2 className="mb-3 font-display text-base font-semibold text-ink">Nouveau signalement</h2>
      <form onSubmit={submit} className="space-y-3">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nature">
            <Select
              value={nature}
              onChange={(e) => {
                setNature(e.target.value as DisciplineNature);
                setTypeId("");
              }}
            >
              <option value="INCIDENT">Incident</option>
              <option value="VALORISATION">Valorisation (point positif)</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Choisir…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date des faits">
            <Input type="date" max={todayLocal()} value={dateFaits} onChange={(e) => setDateFaits(e.target.value)} />
          </Field>
        </div>
        {available.length === 0 && (
          <p className="text-xs text-ink-muted">
            Aucun type {nature === "INCIDENT" ? "d'incident" : "de valorisation"} n&apos;est défini : demandez à la Direction de les créer dans l&apos;onglet Catalogues.
          </p>
        )}
        {nature === "INCIDENT" && (
          <Field label="Gravité">
            <Select value={gravite} onChange={(e) => setGravite(e.target.value as DisciplineGravite)}>
              <option value="LEGER">Léger</option>
              <option value="MOYEN">Moyen</option>
              <option value="GRAVE">Grave</option>
            </Select>
          </Field>
        )}
        <Field label={nature === "INCIDENT" ? "Description des faits" : "Commentaire (facultatif)"}>
          <textarea
            className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Faits constatés, sans numéro de téléphone ni jugement de valeur."
          />
        </Field>
        <p className="text-xs text-ink-muted">Ce texte est confidentiel : la famille ne le voit jamais, seuls la vie scolaire et la Direction le lisent.</p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer le signalement"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
