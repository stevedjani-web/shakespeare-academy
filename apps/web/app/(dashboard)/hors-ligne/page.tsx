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
import { useI18n } from "@/lib/i18n/use-i18n";
import { Rich } from "@/lib/i18n/rich";
import { translate, type MessageKey } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { INTL_LOCALE } from "@/lib/i18n/locales";

const KIND_LABEL: Record<OutboxKind, MessageKey> = {
  payment: "adm.sync.kind.payment",
  expense: "adm.sync.kind.expense",
  discount: "adm.sync.kind.discount",
  student: "adm.sync.kind.student",
  "student-update": "adm.sync.kind.studentUpdate",
  guardian: "adm.sync.kind.guardian",
  enrollment: "adm.sync.kind.enrollment",
  attendance: "adm.sync.kind.attendance",
  checkin: "adm.sync.kind.checkin",
  grades: "adm.sync.kind.grades",
  textbook: "adm.sync.kind.textbook",
};

function when(ts: number | string | null): string {
  if (!ts) return translate("adm.sync.never");
  return new Date(ts).toLocaleString(INTL_LOCALE[getLocale()], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SyncPage() {
  const { t } = useI18n();
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
        eyebrow={t("adm.sync.eyebrow")}
        subtitle={t("adm.sync.subtitle")}
        helpId="hors-ligne"
      >
        {t("adm.sync.title")}
      </PageTitle>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("adm.sync.connection")}
          value={online ? t("adm.sync.online") : t("adm.sync.offline")}
          tone={online ? "success" : "warning"}
          icon={online ? <Wifi size={18} /> : <CloudOff size={18} />}
          hint={t("adm.sync.lastResponse", { when: when(lastOnline) })}
        />
        <StatCard label={t("adm.sync.pending")} value={pending} tone={pending > 0 ? "warning" : "success"} icon={<RefreshCw size={18} />} />
        <StatCard label={t("adm.sync.failed")} value={failed} tone={failed > 0 ? "danger" : "success"} icon={<RefreshCw size={18} />} hint={failed > 0 ? t("adm.sync.failedHint") : t("adm.sync.noneF")} />
        <StatCard label={t("adm.sync.synced")} value={done} tone="info" icon={<RefreshCw size={18} />} />
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void processOutbox()} disabled={!online || pending === 0}>
            <RefreshCw size={16} /> {t("adm.sync.syncNow")}
          </Button>
          <Button variant="secondary" onClick={() => void prepare()} disabled={!online || warming || progress.running}>
            {warming || progress.running ? <Spinner /> : <CloudOff size={16} />} {t("adm.sync.prepare")}
          </Button>
          {(warming || progress.running) && (
            <span className="text-sm text-ink-muted">
              {Math.min(progress.done, progress.total)}/{progress.total}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          <Rich text={t("adm.sync.copiedHelp", { when: when(lastWarm) })} />
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-muted">
          <li>{t("adm.sync.tip1")}</li>
          <li>{t("adm.sync.tip2")}</li>
          <li>{t("adm.sync.tip3")}</li>
        </ul>
      </Card>

      {ordered.length === 0 ? (
        <EmptyState icon={<RefreshCw />} title={t("adm.sync.empty")} description={t("adm.sync.emptyDesc")} />
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
  const { t } = useI18n();
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
          <ExpandButton open={expanded} onClick={onToggle} label={`${t(KIND_LABEL[entry.kind])} ${entry.label}`} />
          <div>
            <p className="font-medium text-ink">
              {t(KIND_LABEL[entry.kind])} · {entry.label}
            </p>
            {entry.montant ? <p className="text-xs text-ink-muted">{formatMontant(entry.montant)}</p> : null}
          </div>
        </div>
        <Badge color={entry.status === "done" ? "green" : entry.status === "failed" ? "red" : "orange"}>
          {entry.status === "done" ? t("adm.sync.statusDone") : entry.status === "failed" ? t("adm.sync.statusFailed") : t("adm.sync.statusPending")}
        </Badge>
      </div>

      {/* Une saisie refusée demande une action : son motif et ses boutons restent visibles sans développer. */}
      {entry.status === "failed" && (
        <div className="mt-3">
          {entry.error && <p className="mb-2 text-sm text-danger">{entry.error}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="secondary" onClick={() => void retryEntry(entry.id)}>
              {t("adm.sync.retry")}
            </Button>
            {duplicate && (
              <Button
                variant="secondary"
                onClick={() => void retryEntry(entry.id, (body) => ({ ...(body as Record<string, unknown>), forcerCreation: true }))}
              >
                {t("adm.sync.createAnyway")}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(t("adm.sync.confirmDiscard"))) void discardEntry(entry.id);
              }}
            >
              {t("adm.sync.discard")}
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <p className="text-xs text-ink-muted">
            {t("adm.sync.enteredOn", { when: when(entry.createdAt), user: entry.userName })}
            {entry.attempts > 0 ? t("adm.sync.attempts", { n: entry.attempts }) : ""}
          </p>
          {entry.status !== "failed" && entry.error && <p className="text-sm text-danger">{entry.error}</p>}
          {otherUser && (
            <p className="text-sm text-warning">
              {t("adm.sync.otherUser", { user: entry.userName })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {entry.receipt && (
              <Link href={`/recus/provisoire/${entry.id}`} className="font-medium text-primary hover:underline">
                {t("adm.sync.provisionalReceipt", { n: entry.receipt.numero })}
              </Link>
            )}
            {entry.status === "done" && entry.kind === "payment" && entry.resultId && (
              <Link href={`/recus/${entry.resultId}`} className="font-medium text-success hover:underline">
                {t("adm.sync.officialReceipt", { n: entry.resultNumero ?? "" })}
              </Link>
            )}
            {entry.status === "done" && (
              <Button variant="ghost" onClick={() => void discardEntry(entry.id)}>
                {t("adm.sync.remove")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
