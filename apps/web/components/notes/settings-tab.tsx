"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { GradeSettings } from "@/lib/grades";
import { parseNote } from "@/lib/grades";
import { Button, Card, ErrorMessage, Field, Input, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

interface SubjectRow {
  id: string;
  nom: string;
  levels: Array<{ levelId: string; coefficient: number; minutesParSemaine: number | null; level: { nom: string } }>;
}

/**
 * Réglages du Lot 15, tous saisis par la Direction (rien n'est codé) : barème par défaut, moyenne de passage, tranches de
 * lettres et sections qui les affichent, visibilité du rang pour les parents, coefficient de chaque matière par niveau.
 */
export function GradeSettingsTab() {
  const [settings, setSettings] = useState<GradeSettings | null>(null);
  const [bands, setBands] = useState<Array<{ lettre: string; minimum: string }>>([]);
  const [passage, setPassage] = useState("");
  const [bareme, setBareme] = useState("20");
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [coefs, setCoefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, subs] = await Promise.all([api.get<GradeSettings>("/grades/settings"), api.get<SubjectRow[]>("/subjects")]);
      setSettings(s);
      setBands(s.bands.map((b) => ({ lettre: b.lettre, minimum: String(b.minimum).replace(".", ",") })));
      setPassage(s.moyennePassage === null ? "" : String(s.moyennePassage).replace(".", ","));
      setBareme(String(s.baremeDefaut));
      setSubjects(subs.filter((x) => x.levels.length > 0));
      setCoefs(Object.fromEntries(subs.flatMap((sub) => sub.levels.map((l) => [`${sub.id}:${l.levelId}`, String(l.coefficient)]))));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const passageValue = parseNote(passage);
      if (passage.trim() !== "" && passageValue === null) throw new Error("La moyenne de passage doit être un nombre.");
      const parsedBands = bands
        .filter((b) => b.lettre.trim() !== "" || b.minimum.trim() !== "")
        .map((b) => {
          const minimum = parseNote(b.minimum);
          if (!b.lettre.trim() || minimum === null) throw new Error("Chaque tranche a une lettre et un minimum.");
          return { lettre: b.lettre.trim(), minimum };
        });
      const updated = await api.put<GradeSettings>("/grades/settings", {
        baremeDefaut: Number(bareme) || settings.baremeDefaut,
        moyennePassage: passageValue,
        bulletinAfficheRang: settings.bulletinAfficheRang,
        bands: parsedBands,
        sections: settings.sections.map((s) => ({ sectionId: s.id, affichageLettres: s.affichageLettres })),
      });
      setSettings(updated);
      setNotice("Réglages enregistrés.");
    } catch (err) {
      setError(err instanceof Error && !("status" in err) ? err.message : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveCoefficients(subject: SubjectRow) {
    setError(null);
    setNotice(null);
    try {
      await api.put(`/subjects/${subject.id}/levels`, {
        levels: subject.levels.map((l) => ({
          levelId: l.levelId,
          ...(l.minutesParSemaine ? { minutesParSemaine: l.minutesParSemaine } : {}),
          coefficient: Math.max(1, Math.min(20, Number(coefs[`${subject.id}:${l.levelId}`]) || 1)),
        })),
      });
      setNotice(`Coefficients de « ${subject.nom} » enregistrés.`);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!settings) return error ? <ErrorMessage>{error}</ErrorMessage> : <Spinner className="h-6 w-6 text-primary" />;

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink">Notes et bulletins</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Barème par défaut d'une évaluation">
            <Input inputMode="numeric" value={bareme} onChange={(e) => setBareme(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Moyenne de passage (vide : aucune mention admis ou refusé)">
            <Input inputMode="decimal" value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="Ex. 10" />
          </Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.bulletinAfficheRang}
            onChange={(e) => setSettings({ ...settings, bulletinAfficheRang: e.target.checked })}
          />
          <span>Les parents voient le rang de leur enfant et les statistiques de la classe sur le bulletin (désactivé par défaut).</span>
        </label>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-ink">Lettres (A à F)</h3>
        <p className="mb-3 text-sm text-ink-muted">
          La lettre s&apos;applique à partir du minimum indiqué (moyenne sur 20). Tant qu&apos;aucune tranche n&apos;est saisie, aucune lettre n&apos;est affichée.
        </p>
        <ul className="space-y-2">
          {bands.map((b, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="w-24">
                <Field label="Lettre">
                  <Input value={b.lettre} maxLength={3} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, lettre: e.target.value } : x)))} />
                </Field>
              </div>
              <div className="w-32">
                <Field label="À partir de">
                  <Input inputMode="decimal" value={b.minimum} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, minimum: e.target.value } : x)))} />
                </Field>
              </div>
              <Button variant="ghost" onClick={() => setBands(bands.filter((_, j) => j !== i))} aria-label="Retirer la tranche">
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-3" onClick={() => setBands([...bands, { lettre: "", minimum: "" }])}>
          <Plus size={15} /> Ajouter une tranche
        </Button>
        <div className="mt-4 space-y-1">
          <p className="text-sm font-medium text-ink">Sections qui affichent les lettres sur leurs bulletins</p>
          {settings.sections.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.affichageLettres}
                onChange={(e) =>
                  setSettings({ ...settings, sections: settings.sections.map((x) => (x.id === s.id ? { ...x, affichageLettres: e.target.checked } : x)) })
                }
              />
              {s.nom}
            </label>
          ))}
        </div>
      </Card>

      <Button onClick={saveSettings} disabled={busy}>
        {busy && <Spinner />} Enregistrer les réglages
      </Button>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-ink">Coefficients des matières</h3>
        <p className="mb-3 text-sm text-ink-muted">Le coefficient d&apos;une matière pèse dans la moyenne générale de chaque niveau où elle est enseignée (1 par défaut).</p>
        {subjects.length === 0 && <p className="text-sm text-ink-muted">Aucune matière n&apos;est rattachée à un niveau.</p>}
        <div className="space-y-3">
          {subjects.map((subject) => (
            <div key={subject.id} className="rounded-2xl border border-border p-3">
              <p className="mb-2 text-sm font-semibold text-ink">{subject.nom}</p>
              <div className="flex flex-wrap items-end gap-3">
                {subject.levels.map((l) => (
                  <div key={l.levelId} className="w-28">
                    <Field label={l.level.nom}>
                      <Input
                        inputMode="numeric"
                        value={coefs[`${subject.id}:${l.levelId}`] ?? "1"}
                        onChange={(e) => setCoefs({ ...coefs, [`${subject.id}:${l.levelId}`]: e.target.value.replace(/\D/g, "") })}
                      />
                    </Field>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => saveCoefficients(subject)}>
                  Enregistrer
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
