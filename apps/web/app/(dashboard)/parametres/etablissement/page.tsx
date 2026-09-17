"use client";

import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useAuth } from "@/contexts/auth-context";
import type { School } from "@/lib/types";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, SuccessMessage } from "@/components/ui";
import { Building2, ImageUp } from "lucide-react";

export default function SchoolSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("SETTINGS_MANAGE");
  const [school, setSchool] = useState<School | null>(null);
  const [form, setForm] = useState({ nom: "", adresse: "", telephone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const updated = await api.upload<School>("/school/logo", formData);
      setSchool(updated);
    } catch (err) {
      setLogoError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (!school) return null;

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary overflow-hidden">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, pas next/image
            <img src={`${API_URL}${school.logoUrl}`} alt="" className="h-full w-full object-contain" />
          ) : (
            <Building2 size={26} />
          )}
        </span>
        <PageTitle subtitle="Identité et coordonnées de l'établissement.">Établissement</PageTitle>
      </div>

      {canManage && (
        <Card className="mb-6 max-w-xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <ImageUp size={16} className="text-primary" /> Logo de l&apos;établissement
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Affiché sur les reçus de paiement. Formats acceptés : JPEG, PNG, WebP (5 Mo max).
          </p>
          <label>
            <span className="sa-interactive inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary-soft">
              {uploadingLogo ? "Envoi…" : school.logoUrl ? "Changer le logo" : "Ajouter un logo"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingLogo}
              onChange={(e) => void handleLogoChange(e)}
            />
          </label>
          <ErrorMessage>{logoError}</ErrorMessage>
        </Card>
      )}

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
