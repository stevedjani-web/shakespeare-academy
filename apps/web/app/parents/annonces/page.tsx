"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Card, EmptyState, ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { formatDateTime } from "@/components/messaging/message-list";
import { useI18n } from "@/lib/i18n/use-i18n";

interface Announcement {
  id: string;
  classe: string;
  titre: string;
  corps: string;
  auteur: string;
  date: string;
  enfants: string[];
}

// Annonces des classes de mes enfants (Lot 13).
export default function ParentAnnouncementsPage() {
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  useEffect(() => {
    if (!parent) return;
    void portalApi
      .get<Announcement[]>("/portal/announcements")
      .then(setItems)
      .catch((err) => setError(describePortalError(err)));
  }, [parent]);

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/parents/messages" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline">
          <ArrowLeft size={15} /> {t("parent.nav.messages")}
        </Link>
        <Link href="/parents" className="text-sm font-medium text-primary underline">
          {t("parent.nav.myChildren")}
        </Link>
      </div>
      <PageTitle subtitle={t("parent.ann.subtitle")}>{t("parent.ann.title")}</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {!items && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}
      {items && items.length === 0 && <EmptyState icon={<Megaphone />} title={t("parent.ann.empty")} description={t("parent.ann.emptyHelp")} />}
      <ul className="space-y-3">
        {items?.map((a) => (
          <li key={a.id}>
            <Card>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{a.titre}</span>
                  <Badge color="primary">{a.classe}</Badge>
                  {a.enfants.length > 0 && <Badge color="slate">{a.enfants.join(", ")}</Badge>}
                </span>
                <span className="text-xs text-ink-muted">{formatDateTime(a.date)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink">{a.corps}</p>
              <p className="mt-2 text-xs text-ink-muted">{t("parent.ann.publishedBy", { author: a.auteur })}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
