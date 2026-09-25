"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
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
  const { t } = useI18n();
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
      if (passage.trim() !== "" && passageValue === null) throw new Error(t("acd.gset.errPassNumber"));
      const parsedBands = bands
        .filter((b) => b.lettre.trim() !== "" || b.minimum.trim() !== "")
        .map((b) => {
          const minimum = parseNote(b.minimum);
          if (!b.lettre.trim() || minimum === null) throw new Error(t("acd.gset.errBand"));
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
      setNotice(t("acd.gset.saved"));
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
      setNotice(t("acd.gset.coefSaved", { name: subject.nom }));
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
        <h3 className="mb-3 text-sm font-semibold text-ink">{t("acd.gset.cardTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("acd.gset.defaultScale")}>
            <Input inputMode="numeric" value={bareme} onChange={(e) => setBareme(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("acd.gset.passMark")}>
            <Input inputMode="decimal" value={passage} onChange={(e) => setPassage(e.target.value)} placeholder={t("acd.gset.passMarkPlaceholder")} />
          </Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.bulletinAfficheRang}
            onChange={(e) => setSettings({ ...settings, bulletinAfficheRang: e.target.checked })}
          />
          <span>{t("acd.gset.showRank")}</span>
        </label>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-ink">{t("acd.gset.lettersTitle")}</h3>
        <p className="mb-3 text-sm text-ink-muted">{t("acd.gset.lettersDesc")}</p>
        <ul className="space-y-2">
          {bands.map((b, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="w-24">
                <Field label={t("acd.gset.letter")}>
                  <Input value={b.lettre} maxLength={3} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, lettre: e.target.value } : x)))} />
                </Field>
              </div>
              <div className="w-32">
                <Field label={t("acd.gset.from")}>
                  <Input inputMode="decimal" value={b.minimum} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, minimum: e.target.value } : x)))} />
                </Field>
              </div>
              <Button variant="ghost" onClick={() => setBands(bands.filter((_, j) => j !== i))} aria-label={t("acd.gset.removeBand")}>
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-3" onClick={() => setBands([...bands, { lettre: "", minimum: "" }])}>
          <Plus size={15} /> {t("acd.gset.addBand")}
        </Button>
        <div className="mt-4 space-y-1">
          <p className="text-sm font-medium text-ink">{t("acd.gset.sectionsTitle")}</p>
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
        {busy && <Spinner />} {t("acd.gset.saveSettings")}
      </Button>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-ink">{t("acd.gset.coefTitle")}</h3>
        <p className="mb-3 text-sm text-ink-muted">{t("acd.gset.coefDesc")}</p>
        {subjects.length === 0 && <p className="text-sm text-ink-muted">{t("acd.gset.noSubjects")}</p>}
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
                  {t("acd.gset.save")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
