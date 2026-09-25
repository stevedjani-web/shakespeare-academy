"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { AbsenceReason } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import { UserX } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

interface Settings {
  retardMaxMinutes: number;
  delaiJustificatifJours: number;
  // Aucune valeur par défaut (D61) : vide tant que la Direction n'en a pas fixé une.
  seuilAlerteAbsences: number | null;
}

/**
 * Paramètres de l'assiduité (D57, D58) et motifs d'absence. Les valeurs de départ sont provisoires :
 * la Direction les confirme ou les change ici, sans intervention technique.
 */
export function AssiduiteTab({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ retard: "", delai: "" });
  const [seuil, setSeuil] = useState("");
  const [reasons, setReasons] = useState<AbsenceReason[]>([]);
  const [libelle, setLibelle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [s, r] = await Promise.all([api.get<Settings>("/pedagogy/settings"), api.get<AbsenceReason[]>("/absence-reasons")]);
    setSettings(s);
    setForm({ retard: String(s.retardMaxMinutes), delai: String(s.delaiJustificatifJours) });
    setSeuil(s.seuilAlerteAbsences === null ? "" : String(s.seuilAlerteAbsences));
    setReasons(r);
  }

  useEffect(() => {
    void load().catch((e) => setError(describeError(e)));
  }, []);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const dirty = settings && (Number(form.retard) !== settings.retardMaxMinutes || Number(form.delai) !== settings.delaiJustificatifJours);

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">{t("sl.att.rules.title")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>
          {t("sl.att.rules.hint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("sl.att.rules.lateMax")}>
            <Input type="number" min={1} max={240} value={form.retard} onChange={(e) => setForm({ ...form, retard: e.target.value })} />
          </Field>
          <Field label={t("sl.att.rules.justifyDelay")}>
            <Input type="number" min={1} max={60} value={form.delai} onChange={(e) => setForm({ ...form, delai: e.target.value })} />
          </Field>
        </div>
        <Button
          className="mt-3"
          disabled={!dirty || !(Number(form.retard) >= 1) || !(Number(form.delai) >= 1)}
          onClick={() =>
            void run(
              () => api.patch("/pedagogy/settings", { retardMaxMinutes: Number(form.retard), delaiJustificatifJours: Number(form.delai) }),
              t("sl.att.rules.saved"),
            )
          }
        >
          {t("sl.att.rules.save")}
        </Button>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">{t("sl.att.alerts.title")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>
          {t("sl.att.alerts.hint")}
        </p>
        <Field label={t("sl.att.alerts.threshold")}>
          <Input type="number" min={1} max={500} value={seuil} placeholder={t("sl.att.alerts.placeholder")} onChange={(e) => setSeuil(e.target.value)} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={seuil.trim() === "" || !(Number(seuil) >= 1) || Number(seuil) === settings?.seuilAlerteAbsences}
            onClick={() => void run(() => api.patch("/pedagogy/settings", { seuilAlerteAbsences: Number(seuil) }), t("sl.att.alerts.saved"))}
          >
            {t("sl.att.alerts.save")}
          </Button>
          {settings?.seuilAlerteAbsences !== null && settings?.seuilAlerteAbsences !== undefined && (
            <Button variant="secondary" onClick={() => void run(() => api.patch("/pedagogy/settings", { seuilAlerteAbsences: null }), t("sl.att.alerts.disabled"))}>
              {t("sl.att.alerts.disable")}
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">{t("sl.att.reasons.title")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>{t("sl.att.reasons.hint")}</p>

        <form
          className="mb-5 space-y-3 border-b border-border pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.post("/absence-reasons", { libelle }), t("sl.att.reasons.added")).then(() => setLibelle(""));
          }}
        >
          <p className="text-sm font-semibold text-ink">{t("sl.att.reasons.addTitle")}</p>
          <Field label={t("sl.att.reasons.label")}>
            <Input required placeholder={t("sl.att.reasons.labelPlaceholder")} value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          </Field>
          <Button type="submit">{t("sl.att.reasons.submit")}</Button>
        </form>

        {reasons.length === 0 ? (
          <EmptyState icon={<UserX />} title={t("sl.att.reasons.empty.title")} description={t("sl.att.reasons.empty.description")} />
        ) : (
          <ul className="space-y-2">
            {reasons.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 ${r.actif ? "" : "opacity-70"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-ink">{r.libelle}</span>
                  {!r.actif && <Badge color="gray">{t("sl.att.reasons.inactive")}</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void run(() => api.patch(`/absence-reasons/${r.id}`, { actif: !r.actif }))}>
                    {r.actif ? t("sl.common.deactivate") : t("sl.common.reactivate")}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm(t("sl.att.reasons.confirmDelete", { name: r.libelle }))) void run(() => api.delete(`/absence-reasons/${r.id}`));
                    }}
                  >
                    {t("sl.common.delete")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
