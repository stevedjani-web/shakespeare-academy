"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Room } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input } from "@/components/ui";
import { DoorOpen } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/** Salles de l'école, utilisées par l'emploi du temps (étape suivante). */
export function SallesTab({ onChanged }: { onChanged: () => void }) {
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
      <h2 className="font-display text-lg font-semibold text-ink">Salles</h2>
      <p className={`mb-3 ${TAB_HINT}`}>Les salles de classe, laboratoires ou autres lieux où se donnent les cours.</p>
      <ErrorMessage>{error}</ErrorMessage>

      {loaded && rooms.length === 0 ? (
        <EmptyState icon={<DoorOpen />} title="Aucune salle." description="Ajoutez la première salle ci-dessous." />
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 ${r.actif ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-2.5">
                <span className="font-medium text-ink">{r.nom}</span>
                {r.capacite && <span className="text-sm text-ink-muted">{r.capacite} places</span>}
                {!r.actif && <Badge color="gray">Désactivée</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void run(() => api.patch(`/rooms/${r.id}`, { actif: !r.actif }))}>
                  {r.actif ? "Désactiver" : "Réactiver"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Supprimer la salle « ${r.nom} » ?`)) void run(() => api.delete(`/rooms/${r.id}`));
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-5 space-y-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api.post("/rooms", { nom: form.nom, capacite: form.capacite ? Number(form.capacite) : undefined }),
            () => setForm({ nom: "", capacite: "" }),
          );
        }}
      >
        <p className="text-sm font-semibold text-ink">Ajouter une salle</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label="Nom">
            <Input required placeholder="Salle 1" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Field>
          <Field label="Capacité (facultatif)">
            <Input type="number" min={1} value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value })} />
          </Field>
        </div>
        <Button type="submit">Ajouter la salle</Button>
      </form>
    </Card>
  );
}
