"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AcademicYear } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle } from "@/components/ui";
import { CalendarPlus, CalendarRange } from "lucide-react";

const STATUS_BADGE: Record<AcademicYear["statut"], { label: string; color: "slate" | "green" | "gray" }> = {
  BROUILLON: { label: "Brouillon", color: "slate" },
  ACTIVE: { label: "Active", color: "green" },
  CLOTUREE: { label: "Clôturée", color: "gray" },
};

export default function AcademicYearsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("ACADEMIC_YEAR_MANAGE");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [form, setForm] = useState({ libelle: "", dateDebut: "", dateFin: "" });
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const data = await api.get<AcademicYear[]>("/academic-years");
    setYears(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/academic-years", form);
      setForm({ libelle: "", dateDebut: "", dateFin: "" });
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(id: string) {
    setActionError(null);
    try {
      await api.post(`/academic-years/${id}/activate`);
      await load();
    } catch (err) {
      setActionError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  async function handleClose(id: string) {
    setActionError(null);
    if (!confirm("Clôturer cette année scolaire ? Elle ne pourra plus être modifiée.")) return;
    try {
      await api.post(`/academic-years/${id}/close`);
      await load();
    } catch (err) {
      setActionError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <CalendarRange size={26} />
        </span>
        <PageTitle subtitle="Une seule année peut être active à la fois.">Années scolaires</PageTitle>
      </div>

      <ErrorMessage>{actionError}</ErrorMessage>

      {years.length === 0 ? (
        <EmptyState icon={<CalendarRange />} title="Aucune année scolaire créée." />
      ) : (
        <Card className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="py-2 pr-4">Libellé</th>
                  <th className="py-2 pr-4">Début</th>
                  <th className="py-2 pr-4">Fin</th>
                  <th className="py-2 pr-4">Statut</th>
                  {canManage && <th className="py-2 pr-4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                    <td className="py-2.5 pr-4 font-medium text-ink">{year.libelle}</td>
                    <td className="py-2.5 pr-4 text-ink-muted">
                      {new Date(year.dateDebut).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">
                      {new Date(year.dateFin).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge color={STATUS_BADGE[year.statut].color}>{STATUS_BADGE[year.statut].label}</Badge>
                    </td>
                    {canManage && (
                      <td className="py-2.5 pr-4">
                        <div className="flex gap-2">
                          {year.statut === "BROUILLON" && (
                            <Button variant="secondary" onClick={() => void handleActivate(year.id)}>
                              Activer
                            </Button>
                          )}
                          {year.statut === "ACTIVE" && (
                            <Button variant="danger" onClick={() => void handleClose(year.id)}>
                              Clôturer
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canManage && (
        <Card className="mt-6 max-w-lg">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarPlus size={16} className="text-primary" /> Créer une année scolaire
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Libellé (ex. 2026-2027)">
              <Input
                required
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date de début">
                <Input
                  type="date"
                  required
                  value={form.dateDebut}
                  onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                />
              </Field>
              <Field label="Date de fin">
                <Input
                  type="date"
                  required
                  value={form.dateFin}
                  onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                />
              </Field>
            </div>
            <ErrorMessage>{error}</ErrorMessage>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Création…" : "Créer"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
