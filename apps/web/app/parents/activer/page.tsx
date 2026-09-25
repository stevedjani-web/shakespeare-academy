"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";
import { parseActivationHash } from "@/lib/parent-activation";
import { useI18n } from "@/lib/i18n/use-i18n";

// Activation du compte d'un responsable (D66) : avec le code remis par le secrétariat, jamais librement.
export default function ParentActivationPage() {
  const { activate } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [version, setVersion] = useState<string | null>(null);
  const [form, setForm] = useState({ telephone: "", code: "", motDePasse: "", confirmation: "" });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lien de la lettre ou du message : le téléphone et le code sont dans le fragment de l'adresse (jamais envoyé à un serveur).
  // On les recopie dans le formulaire puis on les retire de l'adresse, pour qu'ils ne restent pas dans l'historique.
  useEffect(() => {
    const { telephone, code } = parseActivationHash(window.location.hash);
    if (!telephone && !code) return;
    setForm((f) => ({ ...f, ...(telephone ? { telephone } : {}), ...(code ? { code } : {}) }));
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    void portalApi
      .get<{ version: string }>("/portal/consent-info")
      .then((r) => setVersion(r.version))
      .catch((e) => setError(describePortalError(e)));
  }, []);

  const mismatch = form.confirmation !== "" && form.confirmation !== form.motDePasse;
  const tooShort = form.motDePasse !== "" && form.motDePasse.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    setError(null);
    setBusy(true);
    try {
      await activate({ telephone: form.telephone, code: form.code, motDePasse: form.motDePasse, versionPolitique: version });
      router.replace("/parents");
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle subtitle={t("parent.act.subtitle")}>{t("parent.act.title")}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage>{error}</ErrorMessage>
          <Field label={t("parent.login.phone")}>
            <Input type="tel" inputMode="tel" required value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
          </Field>
          <Field label={t("parent.act.code")}>
            <Input required autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label={t("parent.act.choosePassword")}>
            <Input type="password" autoComplete="new-password" required value={form.motDePasse} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
          </Field>
          {tooShort && <p className="text-sm text-danger">{t("parent.act.tooShort")}</p>}
          <Field label={t("parent.act.confirm")}>
            <Input type="password" autoComplete="new-password" required value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} />
          </Field>
          {mismatch && <p className="text-sm text-danger">{t("parent.act.mismatch")}</p>}
          <label className="flex items-start gap-2.5 rounded-xl bg-surface-muted p-3 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              {t("parent.act.consentBefore")}
              <Link href="/parents/confidentialite" target="_blank" className="font-medium text-primary underline">
                {t("parent.act.consentLink")}
              </Link>
              {t("parent.act.consentAfter")}
            </span>
          </label>
          <Button type="submit" disabled={busy || !accepted || mismatch || tooShort || !version || form.motDePasse === ""} className="w-full">
            {busy && <Spinner />} {t("parent.act.submit")}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t("parent.act.haveAccount")}{" "}
        <Link href="/parents/connexion" className="font-medium text-primary underline">
          {t("parent.login.submit")}
        </Link>
      </p>
    </div>
  );
}
