"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParent } from "@/contexts/parent-context";
import { describePortalError } from "@/lib/portal-api";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function ParentLoginPage() {
  const { parent, loading, login } = useParent();
  const { t } = useI18n();
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
      <PageTitle subtitle={t("parent.login.subtitle")}>{t("parent.login.title")}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage>{error}</ErrorMessage>
          <Field label={t("parent.login.phone")}>
            <Input type="tel" inputMode="tel" autoComplete="username" required value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </Field>
          <Field label={t("parent.login.password")}>
            <Input type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Spinner />} {t("parent.login.submit")}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t("parent.login.firstTime")}{" "}
        <Link href="/parents/activer" className="font-medium text-primary underline">
          {t("parent.login.activateLink")}
        </Link>
      </p>
    </div>
  );
}
