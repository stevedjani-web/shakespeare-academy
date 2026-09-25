"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { ParentPushOptIn } from "@/components/parent-push-opt-in";
import type { UnreadPreview } from "@/components/parents/parent-alert";
import { notificationTarget } from "@/lib/parent-alerts";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";

interface Notification {
  id: string;
  type: "ABSENCE" | "RETARD" | "ENSEIGNANT_ABSENT" | "EMPLOI_DU_TEMPS_MODIFIE" | "MESSAGE_RECU" | "ANNONCE" | "BULLETIN_DISPONIBLE" | "DEVOIR_DONNE" | "DISCIPLINE";
  titre: string;
  corps: string;
  occurrences: number;
  enfant: { id: string; prenom: string };
  lue: boolean;
  date: string;
}

interface Preferences {
  pushDisponible: boolean;
  appareils: number;
  preferences: Array<{ type: Notification["type"]; libelle: string; push: boolean }>;
}

// Libellé et explication de chaque type : dans la langue courante (les dictionnaires ont une clé par type).
const typeLabel = (type: Notification["type"]) => translate(`parent.notif.label.${type}` as MessageKey);
const typeHelp = (type: Notification["type"]) => translate(`parent.notif.help.${type}` as MessageKey);

const TYPE_COLOR: Record<Notification["type"], "red" | "orange" | "blue" | "primary" | "green"> = {
  ABSENCE: "red",
  RETARD: "orange",
  ENSEIGNANT_ABSENT: "blue",
  EMPLOI_DU_TEMPS_MODIFIE: "primary",
  MESSAGE_RECU: "green",
  ANNONCE: "blue",
  BULLETIN_DISPONIBLE: "green",
  DEVOIR_DONNE: "orange",
  DISCIPLINE: "red",
};

function formatWhen(value: string): string {
  const d = new Date(value);
  const intl = INTL_LOCALE[getLocale()];
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? translate("parent.notif.today", { time: d.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" }) })
    : d.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Notifications du responsable (Lot 12) : le détail, réservé à l'application connectée, et les préférences.
export default function ParentNotificationsPage() {
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const load = useCallback(async () => {
    try {
      const res = await portalApi.get<{ nonLues: number; notifications: Notification[] }>("/portal/notifications");
      setItems(res.notifications);
      setUnread(res.nonLues);
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      setPrefs(await portalApi.get<Preferences>("/portal/notification-preferences"));
    } catch (err) {
      setError(describePortalError(err));
    }
  }, []);

  useEffect(() => {
    if (!parent) return;
    void load();
    void loadPrefs();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [parent, load, loadPrefs]);

  async function open(n: Notification) {
    if (!n.lue) {
      try {
        await portalApi.patch(`/portal/notifications/${n.id}/read`);
      } catch {
        // Ne pas empêcher d'ouvrir la fiche de l'enfant si le marquage échoue.
      }
    }
    // Un message ou une annonce s'ouvre dans la messagerie ; le reste, sur la fiche de l'enfant.
    if (n.type === "MESSAGE_RECU") {
      // Une seule conversation à lire : on l'ouvre directement, sinon la liste.
      let target = "/parents/messages";
      try {
        const p = await portalApi.get<UnreadPreview>("/portal/messages/unread-preview");
        if (p.threads === 1 && p.messages[0]) target = `/parents/messages/${p.messages[0].threadId}`;
      } catch {
        // Repli sur la liste des conversations.
      }
      router.push(target);
    } else router.push(notificationTarget(n.type, n.enfant.id));
  }

  async function readAll() {
    try {
      await portalApi.post("/portal/notifications/read-all");
      await load();
    } catch (err) {
      setError(describePortalError(err));
    }
  }

  async function toggle(type: Notification["type"], push: boolean) {
    // Affichage immédiat, puis confirmation par le serveur (on revient à l'état réel en cas d'échec).
    setPrefs((p) => (p ? { ...p, preferences: p.preferences.map((x) => (x.type === type ? { ...x, push } : x)) } : p));
    try {
      setPrefs(await portalApi.put<Preferences>("/portal/notification-preferences", { preferences: [{ type, push }] }));
    } catch (err) {
      setError(describePortalError(err));
      await loadPrefs();
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
      <Link href="/parents" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline">
        <ArrowLeft size={15} /> {t("parent.nav.myChildren")}
      </Link>
      <PageTitle subtitle={t("parent.notif.subtitle")}>{t("parent.notif.title")}</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{unread > 0 ? t("parent.notif.unread", { n: unread }) : t("parent.notif.allRead")}</p>
        {unread > 0 && (
          <Button variant="secondary" onClick={() => void readAll()}>
            <CheckCheck size={16} /> {t("parent.notif.markAll")}
          </Button>
        )}
      </div>

      {!items && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}
      {items && items.length === 0 && (
        <EmptyState icon={<Bell />} title={t("parent.notif.empty")} description={t("parent.notif.emptyHelp")} />
      )}

      <ul className="space-y-2.5">
        {items?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void open(n)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors hover:border-primary/40 ${n.lue ? "border-border bg-surface" : "border-primary/40 bg-primary-soft/40"}`}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {!n.lue && <span aria-label={t("parent.notif.unreadAria")} className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  <span className="font-medium text-ink">{n.titre}</span>
                  <Badge color={TYPE_COLOR[n.type]}>{n.enfant.prenom}</Badge>
                </span>
                <span className="text-xs text-ink-muted">{formatWhen(n.date)}</span>
              </div>
              <p className="text-sm text-ink">{n.corps}</p>
            </button>
          </li>
        ))}
      </ul>

      <Card className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">{t("parent.notif.phoneTitle")}</h2>
        <p className="mb-3 text-sm text-ink-muted">{t("parent.notif.phoneIntro")}</p>
        {prefs && <ParentPushOptIn serverEnabled={prefs.pushDisponible} onChange={() => void loadPrefs()} />}

        {prefs && prefs.pushDisponible && (
          <ul className="mt-4 divide-y divide-border">
            {prefs.preferences.map((p) => (
              <li key={p.type} className="flex items-center justify-between gap-3 py-3">
                <label htmlFor={`pref-${p.type}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-medium text-ink">{typeLabel(p.type)}</span>
                  <span className="block text-xs text-ink-muted">{typeHelp(p.type)}</span>
                </label>
                <input
                  id={`pref-${p.type}`}
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                  checked={p.push}
                  onChange={(e) => void toggle(p.type, e.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
