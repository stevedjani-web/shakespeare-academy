"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, GraduationCap } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Spinner, SuccessMessage } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";

interface Enfant {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  lien: string;
  classe: string | null;
  anneeScolaire: string | null;
}

interface Me {
  responsable: { nom: string; prenom: string; telephone: string };
  enfants: Enfant[];
}

export default function ParentHomePage() {
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const expand = useExpanded();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwd, setPwd] = useState({ ancien: "", nouveau: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const [langSaved, setLangSaved] = useState(false);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const load = useCallback(async () => {
    try {
      setMe(await portalApi.get<Me>("/portal/me"));
    } catch (err) {
      setError(describePortalError(err));
    }
  }, []);

  useEffect(() => {
    if (parent) void load();
  }, [parent, load]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await portalApi.patch("/portal/change-password", { ancienMotDePasse: pwd.ancien, nouveauMotDePasse: pwd.nouveau });
      setPwd({ ancien: "", nouveau: "" });
      setNotice(t("parent.home.pwdDone"));
    } catch (err) {
      setError(describePortalError(err));
    }
  }

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <div>
      <PageTitle subtitle={t("parent.home.subtitle")}>{me ? t("parent.home.hello", { name: me.responsable.prenom ?? "" }) : t("parent.home.helloAnon")}</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>

      {me && me.enfants.length === 0 && (
        <EmptyState icon={<GraduationCap />} title={t("parent.home.noChildren")} description={t("parent.home.noChildrenHelp")} />
      )}

      <ul className="space-y-3">
        {me?.enfants.map((e) => (
          <li key={e.id}>
            <Link href={`/parents/enfant/${e.id}`}>
              <Card className="flex items-center justify-between gap-3 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft font-display text-lg font-semibold text-primary">
                    {e.prenom.charAt(0)}
                  </span>
                  <div>
                    <p className="font-medium text-ink">
                      {e.prenom} {e.nom}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {e.classe ?? t("parent.home.noClass")}
                      {e.anneeScolaire ? ` · ${e.anneeScolaire}` : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-ink-muted" size={18} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-ink">{t("lang.label")}</h2>
        <p className="mb-3 mt-1 text-sm text-ink-muted">{t("lang.intro")}</p>
        <LanguageSwitcher
          onChoose={async (langue) => {
            setLangSaved(false);
            await portalApi.patch("/portal/language", { langue });
            setLangSaved(true);
          }}
        />
        {langSaved && (
          <div className="mt-3">
            <SuccessMessage>{t("lang.saved")}</SuccessMessage>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ExpandButton open={expand.isOpen("pwd")} onClick={() => expand.toggle("pwd")} label={t("parent.home.pwdToggle")} />
          {t("parent.home.pwdTitle")}
        </h2>
        {expand.isOpen("pwd") && (
          <form onSubmit={changePassword} className="mt-3 space-y-3">
            {notice && <SuccessMessage>{notice}</SuccessMessage>}
            <Field label={t("parent.home.pwdCurrent")}>
              <Input type="password" autoComplete="current-password" required value={pwd.ancien} onChange={(e) => setPwd({ ...pwd, ancien: e.target.value })} />
            </Field>
            <Field label={t("parent.home.pwdNew")}>
              <Input type="password" autoComplete="new-password" required minLength={8} value={pwd.nouveau} onChange={(e) => setPwd({ ...pwd, nouveau: e.target.value })} />
            </Field>
            <Button type="submit" variant="secondary">
              {t("parent.home.pwdSave")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
