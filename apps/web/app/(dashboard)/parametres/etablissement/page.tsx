"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useAuth } from "@/contexts/auth-context";
import type { School } from "@/lib/types";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, SuccessMessage } from "@/components/ui";

export default function SchoolSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("SETTINGS_MANAGE");
  const [school, setSchool] = useState<School | null>(null);
  const [form, setForm] = useState({ nom: "", adresse: "", telephone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await api.get<School>("/school");
      setSchool(data);
      setForm({
        nom: data.nom,
        adresse: data.adresse ?? "",
        telephone: data.telephone ?? "",
        email: data.email ?? "",
      });
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const updated = await api.patch<School>("/school", form);
      setSchool(updated);
      setSuccess(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!school) return null;

  return (
    <div>
      <PageTitle subtitle="Identité et coordonnées de l'établissement.">Établissement</PageTitle>
      <Card className="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nom de l'établissement">
            <Input
              required
              disabled={!canManage}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
            />
          </Field>
          <Field label="Adresse">
            <Input
              disabled={!canManage}
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </Field>
          <Field label="Téléphone">
            <Input
              disabled={!canManage}
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              disabled={!canManage}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4 text-sm text-ink-muted">
            <div>
              <span className="block font-medium text-ink">Devise</span>
              {school.devise}
            </div>
            <div>
              <span className="block font-medium text-ink">Fuseau horaire</span>
              {school.fuseauHoraire}
            </div>
          </div>
          {!canManage && (
            <p className="text-xs text-ink-muted">
              Lecture seule — la modification des paramètres de l&apos;établissement requiert la permission
              SETTINGS_MANAGE.
            </p>
          )}
          <ErrorMessage>{error}</ErrorMessage>
          <SuccessMessage>{success ? "Paramètres enregistrés." : null}</SuccessMessage>
          {canManage && (
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
