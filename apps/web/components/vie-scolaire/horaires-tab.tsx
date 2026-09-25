"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import type { Section, TimeSlot, TimeSlotType } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, SuccessMessage } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { Clock } from "lucide-react";
import { describeError, TAB_HINT, WEEK_DAYS } from "./shared";

const SLOT_TYPE_KEY: Record<TimeSlotType, MessageKey> = {
  COURS: "sl.hours.type.COURS",
  PAUSE: "sl.hours.type.PAUSE",
};

/** Jours de classe (D52) et grille des créneaux, commune ou propre à une section (D53). */
export function HorairesTab({ sections, onChanged }: { sections: Section[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [jours, setJours] = useState<number[]>([]);
  const [joursSaved, setJoursSaved] = useState(false);
  const [joursError, setJoursError] = useState<string | null>(null);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [scope, setScope] = useState(""); // "" = grille commune, sinon id de section
  const [form, setForm] = useState<{ libelle: string; heureDebut: string; heureFin: string; type: TimeSlotType }>({
    libelle: "",
    heureDebut: "",
    heureFin: "",
    type: "COURS",
  });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ libelle: "", heureDebut: "", heureFin: "", type: "COURS" as TimeSlotType });
  const expand = useExpanded();

  async function load() {
    const [settings, list] = await Promise.all([
      api.get<{ joursClasse: number[] }>("/pedagogy/settings"),
      api.get<TimeSlot[]>("/time-slots"),
    ]);
    setJours(settings.joursClasse);
    setSlots(list);
  }

  useEffect(() => {
    void load().catch((e) => setError(describeError(e)));
  }, []);

  const visible = useMemo(
    () => slots.filter((s) => (scope ? s.sectionId === scope : s.sectionId === null)).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)),
    [slots, scope],
  );
  const sectionHasOwnGrid = (id: string) => slots.some((s) => s.sectionId === id);

  async function saveJours() {
    setJoursError(null);
    setJoursSaved(false);
    try {
      await api.patch("/pedagogy/settings", { joursClasse: jours });
      setJoursSaved(true);
      onChanged();
    } catch (e) {
      setJoursError(describeError(e));
    }
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/time-slots", { ...form, sectionId: scope || undefined });
      setForm({ libelle: "", heureDebut: form.heureFin, heureFin: "", type: "COURS" });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/time-slots/${id}`, editForm);
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function remove(slot: TimeSlot) {
    if (!confirm(t("sl.hours.confirmDelete", { name: slot.libelle }))) return;
    setError(null);
    try {
      await api.delete(`/time-slots/${slot.id}`);
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">{t("sl.hours.days.title")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>{t("sl.hours.days.hint")}</p>
        <div className="flex flex-wrap gap-3">
          {WEEK_DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={jours.includes(d.value)}
                onChange={(e) => setJours((prev) => (e.target.checked ? [...prev, d.value] : prev.filter((v) => v !== d.value)))}
              />
              {d.label}
            </label>
          ))}
        </div>
        <ErrorMessage>{joursError}</ErrorMessage>
        <SuccessMessage>{joursSaved ? t("sl.hours.days.saved") : null}</SuccessMessage>
        <Button className="mt-3" onClick={() => void saveJours()} disabled={jours.length === 0}>
          {t("sl.hours.days.save")}
        </Button>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{t("sl.hours.slots.title")}</h2>
            <p className={TAB_HINT}>
              {t("sl.hours.slots.hint")}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">{t("sl.hours.slots.commonGrid")}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {t("sl.hours.slots.sectionOption", { name: s.nom })}
                  {sectionHasOwnGrid(s.id) ? t("sl.hours.slots.ownGrid") : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        <form onSubmit={addSlot} className="mb-5 space-y-3 border-b border-border pb-4">
          <p className="text-sm font-semibold text-ink">{t("sl.hours.add.title")}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={t("sl.hours.add.label")}>
              <Input required placeholder={t("sl.hours.add.labelPlaceholder")} value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
            </Field>
            <Field label={t("sl.hours.add.start")}>
              <Input type="time" required value={form.heureDebut} onChange={(e) => setForm({ ...form, heureDebut: e.target.value })} />
            </Field>
            <Field label={t("sl.hours.add.end")}>
              <Input type="time" required value={form.heureFin} onChange={(e) => setForm({ ...form, heureFin: e.target.value })} />
            </Field>
            <Field label={t("sl.hours.add.type")}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TimeSlotType })}>
                <option value="COURS">{t("sl.hours.type.COURS")}</option>
                <option value="PAUSE">{t("sl.hours.type.PAUSELong")}</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">{t("sl.hours.add.submit")}</Button>
        </form>

        {visible.length === 0 ? (
          <EmptyState icon={<Clock />} title={t("sl.hours.empty.title")} description={t("sl.hours.empty.description")} />
        ) : (
          <>
            <ExpandAll count={visible.length} onOpenAll={() => expand.openAll(visible.map((s) => s.id))} onCloseAll={expand.closeAll} />
            <ul className="space-y-2">
              {visible.map((slot) => {
                const expanded = expand.isOpen(slot.id);
                const isEditing = editing === slot.id;
                return (
                  <li key={slot.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <ExpandButton open={expanded} onClick={() => expand.toggle(slot.id)} label={slot.libelle} />
                        <span className="font-medium text-ink">{slot.libelle}</span>
                        <span className="text-sm text-ink-muted">
                          {slot.heureDebut} - {slot.heureFin}
                        </span>
                        <Badge color={slot.type === "COURS" ? "primary" : "slate"}>{t(SLOT_TYPE_KEY[slot.type])}</Badge>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-3 border-t border-border pt-3">
                        {isEditing ? (
                          <div className="grid gap-2 sm:grid-cols-4">
                            <Input value={editForm.libelle} onChange={(e) => setEditForm({ ...editForm, libelle: e.target.value })} />
                            <Input type="time" value={editForm.heureDebut} onChange={(e) => setEditForm({ ...editForm, heureDebut: e.target.value })} />
                            <Input type="time" value={editForm.heureFin} onChange={(e) => setEditForm({ ...editForm, heureFin: e.target.value })} />
                            <Select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as TimeSlotType })}>
                              <option value="COURS">{t("sl.hours.type.COURS")}</option>
                              <option value="PAUSE">{t("sl.hours.type.PAUSE")}</option>
                            </Select>
                            <div className="flex gap-2 sm:col-span-4">
                              <Button onClick={() => void saveEdit(slot.id)}>{t("sl.common.save")}</Button>
                              <Button variant="secondary" onClick={() => setEditing(null)}>
                                {t("sl.common.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditing(slot.id);
                                setEditForm({ libelle: slot.libelle, heureDebut: slot.heureDebut, heureFin: slot.heureFin, type: slot.type });
                              }}
                            >
                              {t("sl.common.edit")}
                            </Button>
                            <Button variant="danger" onClick={() => void remove(slot)}>
                              {t("sl.common.delete")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
