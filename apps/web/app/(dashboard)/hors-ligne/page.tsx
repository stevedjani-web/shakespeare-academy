"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { formatMontant } from "@/lib/format";
import { useOnline } from "@/lib/connectivity";
import { getLastOnlineAt } from "@/lib/offline-cache";
import { discardEntry, processOutbox, retryEntry, useOutbox, type OutboxEntry, type OutboxKind } from "@/lib/outbox";
import { getLastWarmup, getWarmupProgress, warmOfflineCache } from "@/lib/offline-warmup";
import { useAuth } from "@/contexts/auth-context";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { Badge, Button, Card, EmptyState, PageTitle, Spinner, StatCard } from "@/components/ui";

const KIND_LABEL: Record<OutboxKind, string> = {
  payment: "Encaissement",
  expense: "Sortie financière",
  discount: "Demande de remise",
  student: "Nouvel élève",
  "student-update": "Correction élève",
  guardian: "Responsable",
  enrollment: "Inscription",
};

function when(ts: number | string | null): string {
  if (!ts) return "jamais";
  return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SyncPage() {
  const online = useOnline();
  const { user } = useAuth();
  const { entries, pending, failed } = useOutbox();
  const [lastOnline, setLastOnline] = useState<number | null>(null);
  const [lastWarm, setLastWarm] = useState<number | null>(null);
  const [warming, setWarming] = useState(false);
  const [progress, setProgress] = useState(getWarmupProgress());
  const expand = useExpanded();

  useEffect(() => {
    void getLastOnlineAt().then(setLastOnline);
    void getLastWarmup().then(setLastWarm);
    const update = () => setProgress({ ...getWarmupProgress() });
    window.addEventListener("sa-warmup", update);
    return () => window.removeEventListener("sa-warmup", update);
  }, [online, warming]);

  async function prepare() {
    setWarming(true);
    try {
      await warmOfflineCache({ force: true, permissions: user?.permissions });
    } finally {
      setWarming(false);
    }
  }

  const done = entries.filter((e) => e.status === "done").length;
  const ordered = [...entries].reverse();

  return (
    <div>
      <PageTitle
        eyebrow="Mode hors ligne"
        subtitle="Ce que cet appareil a saisi sans Internet, et l'état de l'envoi au serveur."
      >
        Synchronisation
      </PageTitle>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Connexion"
          value={online ? "En ligne" : "Hors ligne"}
          tone={online ? "success" : "warning"}
          icon={online ? <Wifi size={18} /> : <CloudOff size={18} />}
          hint={`Dernière réponse du serveur : ${when(lastOnline)}`}
        />
        <StatCard label="En attente d'envoi" value={pending} tone={pending > 0 ? "warning" : "success"} icon={<RefreshCw size={18} />} />
        <StatCard label="En échec" value={failed} tone={failed > 0 ? "danger" : "success"} icon={<RefreshCw size={18} />} hint={failed > 0 ? "À vérifier ci-dessous" : "Aucune"} />
        <StatCard label="Synchronisées" value={done} tone="info" icon={<RefreshCw size={18} />} />
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void processOutbox()} disabled={!online || pending === 0}>
            <RefreshCw size={16} /> Synchroniser maintenant
          </Button>
          <Button variant="secondary" onClick={() => void prepare()} disabled={!online || warming || progress.running}>
            {warming || progress.running ? <Spinner /> : <CloudOff size={16} />} Préparer le mode hors ligne
          </Button>
          {(warming || progress.running) && (
            <span className="text-sm text-ink-muted">
              {Math.min(progress.done, progress.total)}/{progress.total}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Données copiées sur cet appareil le : <strong className="text-ink">{when(lastWarm)}</strong>. Faites « Préparer le mode hors
          ligne » avec Internet avant de partir sur le terrain : élèves, classes, factures et paiements sont alors disponibles sans
          connexion (la copie est aussi rafraîchie automatiquement toutes les 6 heures).
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-muted">
          <li>Sans Internet, un encaissement reçoit un reçu PROVISOIRE ; le reçu officiel (REC-xxxxxx) est attribué à l&apos;envoi.</li>
          <li>Le serveur revérifie chaque saisie : un montant qui dépasse le solde, ou un doublon, est refusé et signalé ici.</li>
          <li>Approuver, rejeter ou annuler une opération exige toujours Internet.</li>
        </ul>
      </Card>

      {ordered.length === 0 ? (
        <EmptyState icon={<RefreshCw />} title="Aucune saisie hors ligne." description="Tout ce que vous saisirez sans Internet apparaîtra ici." />
      ) : (
        <div className="space-y-3">
          <ExpandAll count={ordered.length} onOpenAll={() => expand.openAll(ordered.map((e) => e.id))} onCloseAll={expand.closeAll} />
          {ordered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              currentUserId={user?.id}
              expanded={expand.isOpen(entry.id)}
              onToggle={() => expand.toggle(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  currentUserId,
  expanded,
  onToggle,
}: {
  entry: OutboxEntry;
  currentUserId?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone =
    entry.status === "done"
      ? "border-l-success bg-success-soft/40"
      : entry.status === "failed"
        ? "border-l-danger bg-danger-soft/40"
        : "border-l-warning bg-warning-soft/40";
  const duplicate = entry.kind === "student" && /existe déjà|doublon/i.test(entry.error ?? "");
  const otherUser = entry.status === "pending" && currentUserId && entry.userId !== currentUserId;

  return (
    <div className={`rounded-2xl border border-l-4 border-border p-4 shadow-[var(--shadow-soft)] ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ExpandButton open={expanded} onClick={onToggle} label={`${KIND_LABEL[entry.kind]} ${entry.label}`} />
          <div>
            <p className="font-medium text-ink">
              {KIND_LABEL[entry.kind]} · {entry.label}
            </p>
            {entry.montant ? <p className="text-xs text-ink-muted">{formatMontant(entry.montant)}</p> : null}
          </div>
        </div>
        <Badge color={entry.status === "done" ? "green" : entry.status === "failed" ? "red" : "orange"}>
          {entry.status === "done" ? "Synchronisée" : entry.status === "failed" ? "Échec" : "En attente"}
        </Badge>
      </div>

      {/* Une saisie refusée demande une action : son motif et ses boutons restent visibles sans développer. */}
      {entry.status === "failed" && (
        <div className="mt-3">
          {entry.error && <p className="mb-2 text-sm text-danger">{entry.error}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="secondary" onClick={() => void retryEntry(entry.id)}>
              Réessayer
            </Button>
            {duplicate && (
              <Button
                variant="secondary"
                onClick={() => void retryEntry(entry.id, (body) => ({ ...(body as Record<string, unknown>), forcerCreation: true }))}
              >
                Créer malgré le doublon
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm("Abandonner cette saisie ? Elle ne sera jamais envoyée.")) void discardEntry(entry.id);
              }}
            >
              Abandonner
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <p className="text-xs text-ink-muted">
            Saisie le {when(entry.createdAt)} par {entry.userName}
            {entry.attempts > 0 ? ` · ${entry.attempts} tentative(s) d'envoi` : ""}
          </p>
          {entry.status !== "failed" && entry.error && <p className="text-sm text-danger">{entry.error}</p>}
          {otherUser && (
            <p className="text-sm text-warning">
              Cette saisie sera envoyée quand {entry.userName} se reconnectera (le reçu et le journal doivent porter son nom).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {entry.receipt && (
              <Link href={`/recus/provisoire/${entry.id}`} className="font-medium text-primary hover:underline">
                Reçu provisoire {entry.receipt.numero}
              </Link>
            )}
            {entry.status === "done" && entry.kind === "payment" && entry.resultId && (
              <Link href={`/recus/${entry.resultId}`} className="font-medium text-success hover:underline">
                Reçu officiel {entry.resultNumero ?? ""}
              </Link>
            )}
            {entry.status === "done" && (
              <Button variant="ghost" onClick={() => void discardEntry(entry.id)}>
                Retirer de la liste
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
