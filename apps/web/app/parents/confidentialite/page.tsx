"use client";

import Link from "next/link";
import { privacyPolicy } from "@/lib/privacy-policy";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function ParentPrivacyPage() {
  const { locale } = useI18n();
  const policy = privacyPolicy(locale);
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{policy.title}</h1>
      <p className="mt-1 text-sm text-ink-muted">{policy.versionLine}</p>
      <div className="mt-5 space-y-5">
        {policy.sections.map((s) => (
          <section key={s.titre} className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">{s.titre}</h2>
            {s.contenu.map((p) => (
              <p key={p} className="mb-2 text-sm leading-relaxed text-ink last:mb-0">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-5 text-sm">
        <Link href="/parents" className="font-medium text-primary underline">
          {policy.back}
        </Link>
      </p>
    </div>
  );
}
