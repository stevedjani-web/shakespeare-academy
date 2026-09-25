"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const why = useExpanded();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4 py-12">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-lg">🔒</span>
            <LanguageSwitcher />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink">{t("pwd.requiredTitle")}</h1>
          <div className="mt-3 flex items-center gap-2.5">
            <ExpandButton open={why.isOpen("pourquoi")} onClick={() => why.toggle("pourquoi")} label={t("pwd.whyLabel")} />
            <span className="text-sm font-medium text-ink">{t("pwd.whyQuestion")}</span>
          </div>
          {why.isOpen("pourquoi") && <p className="mt-2 text-sm text-ink-muted">{t("pwd.whyExplanation")}</p>}
        </div>
        <ChangePasswordForm onSuccess={() => router.push("/")} />
      </Card>
    </div>
  );
}
