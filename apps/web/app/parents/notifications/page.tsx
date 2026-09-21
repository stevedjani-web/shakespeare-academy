"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { ParentPushOptIn } from "@/components/parent-push-opt-in";

interface Notification {
  id: string;
  type: "ABSENCE" | "RETARD" | "ENSEIGNANT_ABSENT" | "EMPLOI_DU_TEMPS_MODIFIE" | "MESSAGE_RECU" | "ANNONCE" | "BULLETIN_DISPONIBLE";
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

const TYPE_HELP: Record<Notification["type"], string> = {
  ABSENCE: "Quand une absence est saisie pour votre enfant",
  RETARD: "Quand un retard est saisi pour votre enfant",
  ENSEIGNANT_ABSENT: "Quand un cours de sa classe est annulé ou remplacé",
  EMPLOI_DU_TEMPS_MODIFIE: "Quand l'emploi du temps de sa classe change (regroupé)",
  MESSAGE_RECU: "Quand vous recevez un message d'un enseignant ou de l'école",
  ANNONCE: "Quand une annonce est publiée pour la classe de votre enfant (regroupé)",
  BULLETIN_DISPONIBLE: "Quand un bulletin de votre enfant est publié (jamais la note dans l'alerte)",
};

const TYPE_COLOR: Record<Notification["type"], "red" | "orange" | "blue" | "primary" | "green"> = {
  ABSENCE: "red",
  RETARD: "orange",
  ENSEIGNANT_ABSENT: "blue",
  EMPLOI_DU_TEMPS_MODIFIE: "primary",
  MESSAGE_RECU: "green",
  ANNONCE: "blue",
  BULLETIN_DISPONIBLE: "green",
};

function formatWhen(value: string): string {
  const d = new Date(value);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? `aujourd'hui à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Notifications du responsable (Lot 12) : le détail, réservé à l'application connectée, et les préférences.
export default function ParentNotificationsPage() {
  const { parent, loading } = useParent();
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
    if (n.type === "MESSAGE_RECU") router.push("/parents/messages");
    else if (n.type === "ANNONCE") router.push("/parents/annonces");
    else router.push(`/parents/enfant/${n.enfant.id}`);
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
      <PageTitle subtitle="Absences, retards, cours annulés, changements d'emploi du temps, messages et annonces.">Notifications</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu"}</p>
        {unread > 0 && (
          <Button variant="secondary" onClick={() => void readAll()}>
            <CheckCheck size={16} /> Tout marquer comme lu
          </Button>
        )}
      </div>

      {!items && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}
      {items && items.length === 0 && (
        <EmptyState icon={<Bell />} title="Aucune notification." description="Vous serez prévenu ici dès qu'une absence, un retard ou un changement concerne l'un de vos enfants." />
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
                  {!n.lue && <span aria-label="Non lue" className="h-2.5 w-2.5 rounded-full bg-accent" />}
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
        <h2 className="mb-1 text-sm font-semibold text-ink">Alertes sur votre téléphone</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Les notifications ci-dessus sont toujours dans l&apos;application. L&apos;alerte sur le téléphone est en plus, gratuite, et se règle par type d&apos;événement.
        </p>
        {prefs && <ParentPushOptIn serverEnabled={prefs.pushDisponible} onChange={() => void loadPrefs()} />}

        {prefs && prefs.pushDisponible && (
          <ul className="mt-4 divide-y divide-border">
            {prefs.preferences.map((p) => (
              <li key={p.type} className="flex items-center justify-between gap-3 py-3">
                <label htmlFor={`pref-${p.type}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-medium text-ink">{p.libelle}</span>
                  <span className="block text-xs text-ink-muted">{TYPE_HELP[p.type]}</span>
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
