"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParent } from "@/contexts/parent-context";
import { describePortalError } from "@/lib/portal-api";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";

export default function ParentLoginPage() {
  const { parent, loading, login } = useParent();
  const router = useRouter();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && parent) router.replace("/parents");
  }, [loading, parent, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(telephone, motDePasse);
      router.replace("/parents");
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle subtitle="Suivez l'emploi du temps, les absences et la situation financière de vos enfants.">Espace parents</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage>{error}</ErrorMessage>
          <Field label="Numéro de téléphone (celui donné à l'école)">
            <Input type="tel" inputMode="tel" autoComplete="username" required value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <Input type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Spinner />} Se connecter
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        Première connexion ou mot de passe oublié ?{" "}
        <Link href="/parents/activer" className="font-medium text-primary underline">
          Activer mon compte avec le code de l&apos;école
        </Link>
      </p>
    </div>
  );
}
