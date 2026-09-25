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
import { Building2, FileSignature, ImageUp, KeyRound, Phone, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function SchoolSettingsPage() {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
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
  // Signataire des attestations : tant qu'il n'est pas modifié, on affiche les valeurs de l'école.
  const [signer, setSigner] = useState<{ directeurNom: string; directeurTitre: string; ville: string } | null>(null);
  const [signerMsg, setSignerMsg] = useState<string | null>(null);
  const [signerError, setSignerError] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
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
      setError(isApiError(err) ? err.message : t("common.error"));
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
      setLogoError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveSigner(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !signer) return;
    setSignerMsg(null);
    setSignerError(null);
    try {
      setSchool(
        await api.patch<School>("/school", {
          directeurNom: signer.directeurNom.trim(),
          directeurTitre: signer.directeurTitre.trim() || "Le Directeur",
          ville: signer.ville.trim(),
        }),
      );
      setSigner(null);
      setSignerMsg(t("adm.school.infoSaved"));
    } catch (err) {
      setSignerError(isApiError(err) ? err.message : t("common.error"));
    }
  }

  async function handleSignatureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSignerMsg(null);
    setSignerError(null);
    setUploadingSignature(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      setSchool(await api.upload<School>("/school/signature", formData));
    } catch (err) {
      setSignerError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setUploadingSignature(false);
    }
  }

  async function togglePayments() {
    if (!school) return;
    setPayError(null);
    setPayBusy(true);
    try {
      setSchool(await api.patch<School>("/school", { paiementEnLigneActif: !school.paiementEnLigneActif }));
    } catch (err) {
      setPayError(isApiError(err) ? err.message : t("common.error"));
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
      setValiditeError(t("adm.school.validityInvalid"));
      return;
    }
    try {
      setSchool(await api.patch<School>("/school", { parentCodeValiditeJours: jours }));
      setValiditeMsg(t("adm.school.durationSaved"));
    } catch (err) {
      setValiditeError(isApiError(err) ? err.message : t("common.error"));
    }
  }

  if (!school) return null;

  const signerValue = signer ?? { directeurNom: school.directeurNom ?? "", directeurTitre: school.directeurTitre, ville: school.ville ?? "" };

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
        <PageTitle subtitle={t("adm.school.subtitle")} helpId="parametres-etablissement">
          {t("adm.school.title")}
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
              label={t("adm.school.logoLabel")}
            />
            <ImageUp size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">
              {t("adm.school.logoTitle")}
            </h2>
            <span className="ml-auto text-xs text-ink-muted">
              {school.logoUrl ? t("adm.school.logoSet") : t("adm.school.noLogo")}
            </span>
          </div>
          {expand.isOpen("logo") && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-3 text-xs text-ink-muted">
                {t("adm.school.logoHelp")}
              </p>
              <label>
                <span className="sa-interactive inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary-soft">
                  {uploadingLogo
                    ? t("adm.school.uploading")
                    : school.logoUrl
                      ? t("adm.school.changeLogo")
                      : t("adm.school.addLogo")}
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
            <FileSignature size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">{t("adm.school.docsTitle")}</h2>
            <span className="ml-auto text-xs text-ink-muted">{school.directeurNom && school.ville ? t("adm.school.docsReady") : t("adm.school.docsToComplete")}</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {t("adm.school.docsHelp")}
          </p>
          <form onSubmit={saveSigner} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.school.signerName")}>
                <Input required value={signerValue.directeurNom} onChange={(e) => setSigner({ ...signerValue, directeurNom: e.target.value })} />
              </Field>
              <Field label={t("adm.school.signerTitle")}>
                <Input value={signerValue.directeurTitre} onChange={(e) => setSigner({ ...signerValue, directeurTitre: e.target.value })} />
              </Field>
            </div>
            <Field label={t("adm.school.signerCity")}>
              <Input required value={signerValue.ville} onChange={(e) => setSigner({ ...signerValue, ville: e.target.value })} />
            </Field>
            <Button type="submit" disabled={!signer}>
              {t("adm.school.save")}
            </Button>
          </form>
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-sm font-medium text-ink">{t("adm.school.signature")}</p>
            {school.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- signature servie par l'API, pas next/image
              <img src={`${API_URL}${school.signatureUrl}`} alt={t("adm.school.signature")} className="mb-3 h-16 max-w-48 rounded border border-border bg-white object-contain p-1" />
            )}
            <label>
              <span className="sa-interactive inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary-soft">
                {uploadingSignature ? t("adm.school.uploading") : school.signatureUrl ? t("adm.school.changeSignature") : t("adm.school.addSignature")}
              </span>
              <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={uploadingSignature} onChange={(e) => void handleSignatureChange(e)} />
            </label>
            <p className="mt-2 text-xs text-ink-muted">{t("adm.school.signatureHelp")}</p>
          </div>
          <ErrorMessage>{signerError}</ErrorMessage>
          {signerMsg && <SuccessMessage>{signerMsg}</SuccessMessage>}
        </Card>
      )}

      {canManage && (
        <Card className="mb-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <Smartphone size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">{t("adm.school.payTitle")}</h2>
            <span className="ml-auto text-xs text-ink-muted">{school.paiementEnLigneActif ? t("adm.school.on") : t("adm.school.off")}</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {t("adm.school.payHelp")}
          </p>
          <ErrorMessage>{payError}</ErrorMessage>
          <Button className="mt-3" variant={school.paiementEnLigneActif ? "secondary" : "primary"} disabled={payBusy} onClick={() => void togglePayments()}>
            {payBusy ? t("adm.school.saving") : school.paiementEnLigneActif ? t("adm.school.payDisable") : t("adm.school.payEnable")}
          </Button>
        </Card>
      )}

      {canManage && (
        <Card className="mb-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <KeyRound size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">{t("adm.school.codesTitle")}</h2>
            <span className="ml-auto text-xs text-ink-muted">{t("adm.school.daysCount", { n: school.parentCodeValiditeJours })}</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {t("adm.school.codesHelp")}
          </p>
          <form onSubmit={(e) => void saveValidite(e)} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Field label={t("adm.school.daysField")}>
                <Input
                  inputMode="numeric"
                  value={validite === "" ? String(school.parentCodeValiditeJours) : validite}
                  onChange={(e) => setValidite(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <Button type="submit">{t("adm.school.save")}</Button>
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
            label={t("adm.school.identityLabel")}
          />
          <Phone size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-ink">
            {t("adm.school.identityTitle")}
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
            <Field label={t("adm.school.schoolName")}>
              <Input
                required
                disabled={!canManage}
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </Field>
            <Field label={t("adm.school.address")}>
              <Input
                disabled={!canManage}
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              />
            </Field>
            <Field label={t("adm.school.phone")}>
              <Input
                disabled={!canManage}
                value={form.telephone}
                onChange={(e) =>
                  setForm({ ...form, telephone: e.target.value })
                }
              />
            </Field>
            <Field label={t("adm.school.email")}>
              <Input
                type="email"
                disabled={!canManage}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4 text-sm text-ink-muted">
              <div>
                <span className="block font-medium text-ink">{t("adm.school.currency")}</span>
                {school.devise}
              </div>
              <div>
                <span className="block font-medium text-ink">
                  {t("adm.school.timezone")}
                </span>
                {school.fuseauHoraire}
              </div>
            </div>
            {!canManage && (
              <p className="text-xs text-ink-muted">
                {t("adm.school.readOnly")}
              </p>
            )}
            <ErrorMessage>{error}</ErrorMessage>
            <SuccessMessage>
              {success ? t("adm.school.settingsSaved") : null}
            </SuccessMessage>
            {canManage && (
              <Button type="submit" disabled={submitting}>
                {submitting ? t("adm.school.saving") : t("adm.school.save")}
              </Button>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
