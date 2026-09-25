"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Room } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input } from "@/components/ui";
import { DoorOpen } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/** Salles de l'école, utilisées par l'emploi du temps (étape suivante). */
export function SallesTab({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ nom: "", capacite: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setRooms(await api.get<Room[]>("/rooms"));
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch((e) => {
      setError(describeError(e));
      setLoaded(true);
    });
  }, []);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-ink">{t("sl.rooms.title")}</h2>
      <p className={`mb-3 ${TAB_HINT}`}>{t("sl.rooms.hint")}</p>
      <ErrorMessage>{error}</ErrorMessage>

      <form
        className="mb-5 space-y-3 border-b border-border pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api.post("/rooms", { nom: form.nom, capacite: form.capacite ? Number(form.capacite) : undefined }),
            () => setForm({ nom: "", capacite: "" }),
          );
        }}
      >
        <p className="text-sm font-semibold text-ink">{t("sl.rooms.add.title")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label={t("sl.rooms.add.name")}>
            <Input required placeholder={t("sl.rooms.add.namePlaceholder")} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Field>
          <Field label={t("sl.rooms.add.capacity")}>
            <Input type="number" min={1} value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value })} />
          </Field>
        </div>
        <Button type="submit">{t("sl.rooms.add.submit")}</Button>
      </form>

      {loaded && rooms.length === 0 ? (
        <EmptyState icon={<DoorOpen />} title={t("sl.rooms.empty.title")} description={t("sl.rooms.empty.description")} />
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 ${r.actif ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-2.5">
                <span className="font-medium text-ink">{r.nom}</span>
                {r.capacite && <span className="text-sm text-ink-muted">{t("sl.rooms.seats", { n: r.capacite })}</span>}
                {!r.actif && <Badge color="gray">{t("sl.rooms.inactive")}</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void run(() => api.patch(`/rooms/${r.id}`, { actif: !r.actif }))}>
                  {r.actif ? t("sl.common.deactivate") : t("sl.common.reactivate")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(t("sl.rooms.confirmDelete", { name: r.nom }))) void run(() => api.delete(`/rooms/${r.id}`));
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
  );
}
