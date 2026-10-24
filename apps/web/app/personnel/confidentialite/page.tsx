"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { STAFF_PRIVACY_VERSION } from "@/lib/staff-privacy";

const SECTIONS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

/** Conditions d'usage et données du personnel : page publique, lue avant d'envoyer ses informations. */
export default function StaffPrivacyPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft size={15} /> {t("tco.priv.back")}
        </button>
        <LanguageSwitcher />
      </div>
      <h1 className="font-display text-3xl font-semibold text-ink">{t("tco.priv.title")}</h1>
      <p className="mt-1 text-xs text-ink-muted">{t("tco.priv.version", { version: STAFF_PRIVACY_VERSION })}</p>
      <p className="mt-3 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{t("tco.priv.draft")}</p>
      <div className="mt-6 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s}>
            <h2 className="font-display text-lg font-semibold text-ink">{t(`tco.priv.${s}.title` as MessageKey)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink">{t(`tco.priv.${s}.body` as MessageKey)}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-ink-muted">
        <Link href="/login" className="hover:underline">
          Shakespeare Academy
        </Link>
      </p>
      <div className="mt-4">
        <CopyrightFooter />
      </div>
    </div>
  );
}
