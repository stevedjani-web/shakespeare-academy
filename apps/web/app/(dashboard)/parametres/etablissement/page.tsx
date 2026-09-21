"use client";

import { useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useAuth } from "@/contexts/auth-context";
import type { School } from "@/lib/types";
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
  PageTitle,
  SuccessMessage,
} from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { Building2, ImageUp, KeyRound, Phone, Smartphone } from "lucide-react";

export default function SchoolSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("SETTINGS_MANAGE");
  const [school, setSchool] = useState<School | null>(null);
  const [form, setForm] = useState({
    nom: "",
    adresse: "",
    telephone: "",
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [validite, setValidite] = useState("");
  const [validiteMsg, setValiditeMsg] = useState<string | null>(null);
  const [validiteError, setValiditeError] = useState<string | null>(null);
  const expand = useExpanded();

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

  async function togglePayments() {
    if (!school) return;
    setPayError(null);
    setPayBusy(true);
    try {
      setSchool(await api.patch<School>("/school", { paiementEnLigneActif: !school.paiementEnLigneActif }));
    } catch (err) {
      setPayError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setPayBusy(false);
    }
  }

  async function saveValidite(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    const jours = Number(validite);
    setValiditeMsg(null);
    setValiditeError(null);
    if (!Number.isInteger(jours) || jours < 1 || jours > 90) {
      setValiditeError("Saisissez un nombre entier de jours entre 1 et 90.");
      return;
    }
    try {
      setSchool(await api.patch<School>("/school", { parentCodeValiditeJours: jours }));
      setValiditeMsg("Durée enregistrée.");
    } catch (err) {
      setValiditeError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  if (!school) return null;

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary overflow-hidden">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, pas next/image
            <img
              src={`${API_URL}${school.logoUrl}`}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <Building2 size={26} />
          )}
        </span>
        <PageTitle subtitle="Identité et coordonnées de l'établissement.">
          Établissement
        </PageTitle>
      </div>

      <div className="mt-4 max-w-xl">
        <ExpandAll
          count={canManage ? 2 : 1}
          onOpenAll={() => expand.openAll(["identite", "logo"])}
          onCloseAll={expand.closeAll}
        />
      </div>

      {canManage && (
        <Card className="mb-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <ExpandButton
              open={expand.isOpen("logo")}
              onClick={() => expand.toggle("logo")}
              label="le logo"
            />
            <ImageUp size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">
              Logo de l&apos;établissement
            </h2>
            <span className="ml-auto text-xs text-ink-muted">
              {school.logoUrl ? "Logo défini" : "Aucun logo"}
            </span>
          </div>
          {expand.isOpen("logo") && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-3 text-xs text-ink-muted">
                Affiché sur les reçus de paiement. Formats acceptés : JPEG, PNG,
                WebP (5 Mo max).
              </p>
              <label>
                <span className="sa-interactive inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary-soft">
                  {uploadingLogo
                    ? "Envoi…"
                    : school.logoUrl
                      ? "Changer le logo"
                      : "Ajouter un logo"}
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
            </div>
          )}
        </Card>
      )}

      {canManage && (
        <Card className="mb-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <Smartphone size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">Paiement des frais par les parents</h2>
            <span className="ml-auto text-xs text-ink-muted">{school.paiementEnLigneActif ? "Activé" : "Désactivé"}</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Quand il est activé, un parent peut payer une tranche de scolarité par Mobile Money depuis son espace. Les frais du prestataire de paiement
            sont à la charge de l&apos;école. L&apos;option ne s&apos;affiche aux parents que si les clés du prestataire (PawaPay) sont aussi configurées sur le serveur.
          </p>
          <ErrorMessage>{payError}</ErrorMessage>
          <Button className="mt-3" variant={school.paiementEnLigneActif ? "secondary" : "primary"} disabled={payBusy} onClick={() => void togglePayments()}>
            {payBusy ? "Enregistrement…" : school.paiementEnLigneActif ? "Désactiver le paiement en ligne" : "Activer le paiement en ligne"}
          </Button>
        </Card>
      )}

      {canManage && (
        <Card className="mb-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <KeyRound size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">Codes d&apos;activation des parents</h2>
            <span className="ml-auto text-xs text-ink-muted">{school.parentCodeValiditeJours} jours</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Durée pendant laquelle un code d&apos;activation reste valable après sa génération. Une lettre distribuée par les élèves peut arriver
            plusieurs jours plus tard : 30 jours conviennent en général. Cette durée peut aussi être choisie à chaque génération en lot.
          </p>
          <form onSubmit={(e) => void saveValidite(e)} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Field label="Jours (1 à 90)">
                <Input
                  inputMode="numeric"
                  value={validite === "" ? String(school.parentCodeValiditeJours) : validite}
                  onChange={(e) => setValidite(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <Button type="submit">Enregistrer</Button>
          </form>
          <ErrorMessage>{validiteError}</ErrorMessage>
          <SuccessMessage>{validiteMsg}</SuccessMessage>
        </Card>
      )}

      <Card className="max-w-xl">
        <div className="flex items-center gap-2.5">
          <ExpandButton
            open={expand.isOpen("identite")}
            onClick={() => expand.toggle("identite")}
            label="l'identité et les coordonnées"
          />
          <Phone size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-ink">
            Identité et coordonnées
          </h2>
          <span className="ml-auto truncate text-xs text-ink-muted">
            {school.nom}
          </span>
        </div>
        {expand.isOpen("identite") && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-4 border-t border-border pt-3"
          >
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
                onChange={(e) =>
                  setForm({ ...form, telephone: e.target.value })
                }
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
                <span className="block font-medium text-ink">
                  Fuseau horaire
                </span>
                {school.fuseauHoraire}
              </div>
            </div>
            {!canManage && (
              <p className="text-xs text-ink-muted">
                Lecture seule — la modification des paramètres de
                l&apos;établissement requiert la permission SETTINGS_MANAGE.
              </p>
            )}
            <ErrorMessage>{error}</ErrorMessage>
            <SuccessMessage>
              {success ? "Paramètres enregistrés." : null}
            </SuccessMessage>
            {canManage && (
              <Button type="submit" disabled={submitting}>
                {submitting ? "Enregistrement…" : "Enregistrer"}
              </Button>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
