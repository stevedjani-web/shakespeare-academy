"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Card, PageTitle, SuccessMessage } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function MonComptePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [langSaved, setLangSaved] = useState(false);

  return (
    <div>
      <PageTitle eyebrow={t("account.eyebrow")} subtitle={t("account.subtitle")}>
        {t("account.title")}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-lg font-semibold text-ink">{t("account.identity")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">{t("account.name")}</dt>
                <dd className="font-medium text-ink">
                  {user?.prenom} {user?.nom}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t("account.loginId")}</dt>
                <dd className="break-all font-medium text-ink">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t("account.role")}</dt>
                <dd className="font-medium text-ink">{user?.roleCode}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink">{t("lang.label")}</h2>
            <p className="mb-3 mt-1 text-sm text-ink-muted">{t("lang.intro")}</p>
            <LanguageSwitcher
              onChoose={async (langue) => {
                setLangSaved(false);
                await api.patch("/auth/language", { langue });
                setLangSaved(true);
              }}
            />
            {langSaved && (
              <div className="mt-3">
                <SuccessMessage>{t("lang.saved")}</SuccessMessage>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">{t("account.changePassword")}</h2>
          <p className="mb-4 mt-1 text-sm text-ink-muted">{t("account.changePasswordHelp")}</p>
          {done && (
            <div className="mb-4">
              <SuccessMessage>{t("account.passwordDone")}</SuccessMessage>
            </div>
          )}
          <ChangePasswordForm onSuccess={() => setDone(true)} />
        </Card>
      </div>
    </div>
  );
}
