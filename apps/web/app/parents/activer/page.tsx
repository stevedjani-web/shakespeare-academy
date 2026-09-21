"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";

// Activation du compte d'un responsable (D66) : avec le code remis par le secrétariat, jamais librement.
export default function ParentActivationPage() {
  const { activate } = useParent();
  const router = useRouter();
  const [version, setVersion] = useState<string | null>(null);
  const [form, setForm] = useState({ telephone: "", code: "", motDePasse: "", confirmation: "" });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <PageTitle subtitle="Le secrétariat de l'école vous remet un code à usage unique. Saisissez-le avec votre numéro de téléphone pour créer votre mot de passe.">
        Activer mon compte
      </PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage>{error}</ErrorMessage>
          <Field label="Numéro de téléphone (celui donné à l'école)">
            <Input type="tel" inputMode="tel" required value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
          </Field>
          <Field label="Code d'activation">
            <Input required autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Choisissez un mot de passe (8 caractères au moins)">
            <Input type="password" autoComplete="new-password" required value={form.motDePasse} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
          </Field>
          {tooShort && <p className="text-sm text-danger">Le mot de passe doit contenir au moins 8 caractères.</p>}
          <Field label="Confirmez le mot de passe">
            <Input type="password" autoComplete="new-password" required value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} />
          </Field>
          {mismatch && <p className="text-sm text-danger">Les deux mots de passe ne sont pas identiques.</p>}
          <label className="flex items-start gap-2.5 rounded-xl bg-surface-muted p-3 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              J&apos;ai lu la{" "}
              <Link href="/parents/confidentialite" target="_blank" className="font-medium text-primary underline">
                politique de confidentialité
              </Link>{" "}
              et j&apos;accepte que l&apos;école me donne accès aux informations de mes enfants dans cet espace.
            </span>
          </label>
          <Button type="submit" disabled={busy || !accepted || mismatch || tooShort || !version || form.motDePasse === ""} className="w-full">
            {busy && <Spinner />} Créer mon compte
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        Vous avez déjà un compte ?{" "}
        <Link href="/parents/connexion" className="font-medium text-primary underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
