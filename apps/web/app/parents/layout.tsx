"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, MessageSquare } from "lucide-react";
import { ParentProvider, useParent } from "@/contexts/parent-context";
import { portalApi } from "@/lib/portal-api";
import { Button } from "@/components/ui";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";
import { ParentAlert } from "@/components/parents/parent-alert";

/** Icône de la messagerie avec le nombre de messages non lus. */
function MessagesLink() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      setCount(
        (
          await portalApi.get<{ nonLus: number }>(
            "/portal/messages/unread-count",
          )
        ).nonLus,
      );
    } catch {
      // Sans réponse, on garde le dernier nombre connu.
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh, pathname]);
  return (
    <Link
      href="/parents/messages"
      aria-label={
        count > 0
          ? t("parent.nav.messagesUnread", { n: count })
          : t("parent.nav.messages")
      }
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
    >
      <MessageSquare size={20} />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-primary">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/** Cloche des notifications : nombre de non lues, à jour au changement de page et toutes les minutes. */
function NotificationBell() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      setCount(
        (
          await portalApi.get<{ nonLues: number }>(
            "/portal/notifications/unread-count",
          )
        ).nonLues,
      );
    } catch {
      // La cloche ne doit jamais gêner : sans réponse, on garde le dernier nombre connu.
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh, pathname]);
  return (
    <Link
      href="/parents/notifications"
      aria-label={
        count > 0
          ? t("parent.nav.notificationsUnread", { n: count })
          : t("parent.nav.notifications")
      }
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
    >
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-primary">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { parent, logout } = useParent();
  const { t, locale } = useI18n();
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-bg">
      <header className="bg-primary text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/parents" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 font-display text-lg font-bold text-accent">
              S
            </span>
            <span>
              <span className="block font-display text-base font-semibold leading-tight">
                Shakespeare Academy
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-white/60">
                {t("parent.nav.space")}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher
              variant="dark"
              className="mr-1"
              onChoose={
                parent
                  ? (langue) => portalApi.patch("/portal/language", { langue })
                  : undefined
              }
            />
            {parent && (
              <>
                <MessagesLink />
                <NotificationBell />
                <Button
                  variant="ghost"
                  onClick={() => void logout()}
                  className="text-white hover:bg-white/10"
                >
                  <LogOut size={16} />{" "}
                  <span className="hidden sm:inline">
                    {t("parent.nav.logout")}
                  </span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main key={locale} className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {parent && <ParentAlert />}
        {children}
      </main>
      <footer className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-8 text-center text-xs text-ink-muted">
        <Link href="/parents/confidentialite" className="underline">
          {t("parent.nav.privacy")}
        </Link>
        <CopyrightFooter />
      </footer>
    </div>
  );
}

// Espace des responsables d'élèves (Lot 11) : lecture seule, compte à part de celui du personnel.
export default function ParentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentProvider>
      <Shell>{children}</Shell>
    </ParentProvider>
  );
}
