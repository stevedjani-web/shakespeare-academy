"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatDateTime } from "@/components/messaging/message-list";

interface ClassItem {
  id: string;
  nom: string;
  anneeScolaire: string;
}

interface Announcement {
  id: string;
  classe: string;
  classId: string;
  titre: string;
  corps: string;
  auteur: string;
  date: string;
  retire: { le: string; motif: string | null } | null;
  peutRetirer: boolean;
}

const TEXTAREA = "min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink";

// Annonces de classe (Lot 13) : tous les responsables des élèves de la classe les voient et sont prévenus.
export default function AnnoncesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canUse = hasPermission("MESSAGE_USE");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [classId, setClassId] = useState("");
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<Announcement[]>("/messaging/announcements"));
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    if (!canUse) return;
    void load();
    void api
      .get<ClassItem[]>("/messaging/classes")
      .then(setClasses)
      .catch((err) => setError(describeError(err)));
  }, [canUse, load]);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/messaging/announcements", { classId, titre, corps });
      setTitre("");
      setCorps("");
      setNotice(t("acd.ann.published"));
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    const motif = (motifs[id] ?? "").trim();
    if (!motif) return;
    try {
      await api.post(`/messaging/announcements/${id}/withdraw`, { motif });
      setNotice(t("acd.ann.withdrawn"));
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!canUse) {
    return (
      <div>
        <PageTitle eyebrow={t("acd.ann.eyebrow")}>{t("acd.ann.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("acd.ann.noPermission")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle eyebrow={t("acd.ann.eyebrow")} subtitle={t("acd.ann.subtitle")} helpId="annonces">
        {t("acd.ann.title")}
      </PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card className="mb-6">
        <form onSubmit={publish} className="space-y-3">
          <Field label={t("acd.ann.class")}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="">{t("acd.ann.choose")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.anneeScolaire})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("acd.ann.titleField")}>
            <Input value={titre} maxLength={120} required onChange={(e) => setTitre(e.target.value)} />
          </Field>
          <Field label={t("acd.ann.bodyField")}>
            <textarea className={TEXTAREA} maxLength={2000} required value={corps} onChange={(e) => setCorps(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-muted">{t("acd.ann.alertNote")}</p>
          <Button type="submit" disabled={busy || !classId || !titre.trim() || !corps.trim()}>
            <Megaphone size={16} /> {t("acd.ann.publish")}
          </Button>
        </form>
      </Card>

      {!items && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.ann.loading")}
        </p>
      )}
      {items && items.length === 0 && <EmptyState title={t("acd.ann.emptyTitle")} description={t("acd.ann.emptyDesc")} />}
      <ul className="space-y-3">
        {items?.map((a) => (
          <li key={a.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{a.titre}</span>
                <Badge color="primary">{a.classe}</Badge>
                {a.retire && <Badge color="red">{t("acd.ann.withdrawnBadge")}</Badge>}
              </span>
              <span className="text-xs text-ink-muted">
                {a.auteur} · {formatDateTime(a.date)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{a.corps}</p>
            {a.retire ? (
              <p className="mt-2 text-xs text-ink-muted">{t("acd.ann.withdrawnOn", { date: formatDateTime(a.retire.le), reason: a.retire.motif ?? "" })}</p>
            ) : (
              a.peutRetirer && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input className="!w-72" placeholder={t("acd.ann.reasonPlaceholder")} value={motifs[a.id] ?? ""} onChange={(e) => setMotifs({ ...motifs, [a.id]: e.target.value })} />
                  <Button variant="danger" disabled={!(motifs[a.id] ?? "").trim()} onClick={() => void withdraw(a.id)}>
                    {t("acd.ann.withdraw")}
                  </Button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
