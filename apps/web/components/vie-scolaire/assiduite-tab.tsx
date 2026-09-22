"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
        <h2 className="font-display text-lg font-semibold text-ink">Règles d&apos;assiduité</h2>
        <p className={`mb-3 ${TAB_HINT}`}>
          Valeurs de départ provisoires (retard jusqu&apos;à 15 minutes, justificatif sous 3 jours de classe). À confirmer ou à changer par la Direction.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Un élève arrivé après ce nombre de minutes est absent de la séance">
            <Input type="number" min={1} max={240} value={form.retard} onChange={(e) => setForm({ ...form, retard: e.target.value })} />
          </Field>
          <Field label="Délai pour justifier une absence (jours de classe)">
            <Input type="number" min={1} max={60} value={form.delai} onChange={(e) => setForm({ ...form, delai: e.target.value })} />
          </Field>
        </div>
        <Button
          className="mt-3"
          disabled={!dirty || !(Number(form.retard) >= 1) || !(Number(form.delai) >= 1)}
          onClick={() =>
            void run(
              () => api.patch("/pedagogy/settings", { retardMaxMinutes: Number(form.retard), delaiJustificatifJours: Number(form.delai) }),
              "Règles enregistrées.",
            )
          }
        >
          Enregistrer les règles
        </Button>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">Alertes de décrochage</h2>
        <p className={`mb-3 ${TAB_HINT}`}>
          Aucun seuil n&apos;est proposé : les alertes sont désactivées tant que la Direction n&apos;en fixe pas un. Un élève apparaît dans les alertes du tableau de bord de pilotage
          quand il atteint ce nombre d&apos;absences non justifiées sur la période affichée (une absence dont le délai de justification court encore n&apos;est pas comptée).
        </p>
        <Field label="Nombre d'absences non justifiées à partir duquel signaler un élève (vide = alertes désactivées)">
          <Input type="number" min={1} max={500} value={seuil} placeholder="Désactivées" onChange={(e) => setSeuil(e.target.value)} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={seuil.trim() === "" || !(Number(seuil) >= 1) || Number(seuil) === settings?.seuilAlerteAbsences}
            onClick={() => void run(() => api.patch("/pedagogy/settings", { seuilAlerteAbsences: Number(seuil) }), "Seuil d'alerte enregistré.")}
          >
            Enregistrer le seuil
          </Button>
          {settings?.seuilAlerteAbsences !== null && settings?.seuilAlerteAbsences !== undefined && (
            <Button variant="secondary" onClick={() => void run(() => api.patch("/pedagogy/settings", { seuilAlerteAbsences: null }), "Alertes désactivées.")}>
              Désactiver les alertes
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">Motifs d&apos;absence</h2>
        <p className={`mb-3 ${TAB_HINT}`}>La liste proposée au moment d&apos;enregistrer un justificatif. Aucun motif n&apos;est prérempli.</p>

        <form
          className="mb-5 space-y-3 border-b border-border pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.post("/absence-reasons", { libelle }), "Motif ajouté.").then(() => setLibelle(""));
          }}
        >
          <p className="text-sm font-semibold text-ink">Ajouter un motif</p>
          <Field label="Libellé">
            <Input required placeholder="Maladie" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          </Field>
          <Button type="submit">Ajouter le motif</Button>
        </form>

        {reasons.length === 0 ? (
          <EmptyState icon={<UserX />} title="Aucun motif." description="Ajoutez le premier motif ci-dessus (par exemple maladie)." />
        ) : (
          <ul className="space-y-2">
            {reasons.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 ${r.actif ? "" : "opacity-70"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-ink">{r.libelle}</span>
                  {!r.actif && <Badge color="gray">Désactivé</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void run(() => api.patch(`/absence-reasons/${r.id}`, { actif: !r.actif }))}>
                    {r.actif ? "Désactiver" : "Réactiver"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Supprimer le motif « ${r.libelle} » ?`)) void run(() => api.delete(`/absence-reasons/${r.id}`));
                    }}
                  >
                    Supprimer
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
