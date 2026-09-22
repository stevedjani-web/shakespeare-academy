"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, ErrorMessage, Input, Select } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import type { DisciplineNature, DisciplineType, SanctionType } from "@/lib/discipline";

/**
 * Catalogues de l'école : types d'incident, types de valorisation, types de sanction. Aucun n'est préchargé : le règlement
 * intérieur est celui de l'école. Un type désactivé n'est plus proposé mais reste lisible sur les anciens dossiers.
 */
export function CataloguesPanel() {
  const [types, setTypes] = useState<DisciplineType[]>([]);
  const [sanctions, setSanctions] = useState<SanctionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nature, setNature] = useState<DisciplineNature>("INCIDENT");
  const [nom, setNom] = useState("");
  const [sanctionNom, setSanctionNom] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([api.get<DisciplineType[]>("/discipline/types"), api.get<SanctionType[]>("/discipline/sanction-types")]);
      setTypes(t);
      setSanctions(s);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ErrorMessage>{error}</ErrorMessage>
      <Card>
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Types de signalement</h2>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post("/discipline/types", { nature, nom });
              setNom("");
            });
          }}
        >
          <div className="w-44">
            <Select value={nature} onChange={(e) => setNature(e.target.value as DisciplineNature)} aria-label="Nature">
              <option value="INCIDENT">Incident</option>
              <option value="VALORISATION">Valorisation</option>
            </Select>
          </div>
          <div className="min-w-40 flex-1">
            <Input required minLength={2} maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Bagarre, Retards répétés, Félicitations" />
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
        {types.length === 0 && <p className="text-sm text-ink-muted">Aucun type défini : ajoutez ceux de votre règlement intérieur.</p>}
        <ul className="divide-y divide-border text-sm">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2 text-ink">
                {t.nom} <Badge color={t.nature === "INCIDENT" ? "red" : "green"}>{t.nature === "INCIDENT" ? "Incident" : "Valorisation"}</Badge>
                {!t.actif && <Badge color="gray">Désactivé</Badge>}
              </span>
              <Button variant="ghost" onClick={() => void run(() => api.patch(`/discipline/types/${t.id}`, { actif: !t.actif }))}>
                {t.actif ? "Désactiver" : "Réactiver"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Types de sanction</h2>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post("/discipline/sanction-types", { nom: sanctionNom });
              setSanctionNom("");
            });
          }}
        >
          <div className="min-w-40 flex-1">
            <Input required minLength={2} maxLength={80} value={sanctionNom} onChange={(e) => setSanctionNom(e.target.value)} placeholder="Ex. : Avertissement, Retenue, Exclusion temporaire" />
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
        {sanctions.length === 0 && <p className="text-sm text-ink-muted">Aucune sanction définie : ajoutez celles de votre règlement intérieur.</p>}
        <ul className="divide-y divide-border text-sm">
          {sanctions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2 text-ink">
                {s.nom} {!s.actif && <Badge color="gray">Désactivée</Badge>}
              </span>
              <Button variant="ghost" onClick={() => void run(() => api.patch(`/discipline/sanction-types/${s.id}`, { actif: !s.actif }))}>
                {s.actif ? "Désactiver" : "Réactiver"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
