"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, PageTitle, Select, Spinner } from "@/components/ui";
import { formatDateTime } from "@/components/messaging/message-list";
import { PrioritySelect } from "@/components/messaging/priority-select";
import { PRIORITY_META, priorityText, type MessagePriority } from "@/lib/message-priority";
import { useI18n } from "@/lib/i18n/use-i18n";

interface Thread {
  id: string;
  enfant: { id: string; prenom: string };
  interlocuteur: string;
  nonLus: number;
  /** La priorité la plus pressante parmi les messages non lus (null s'il n'y en a pas). */
  prioriteNonLus: MessagePriority | null;
  dernierMessage: { auteur: "PARENT" | "PERSONNEL"; apercu: string | null; date: string } | null;
}

interface Child {
  id: string;
  prenom: string;
  nom: string;
}

interface Contacts {
  classe: string | null;
  enseignants: Array<{ id: string; nom: string; prenom: string; matieres: string[] }>;
  ecole: boolean;
}

// Messagerie du responsable (Lot 13) : conversations avec les enseignants de la classe de son enfant et avec l'école.
export default function ParentMessagesPage() {
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [delai, setDelai] = useState<number | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const load = useCallback(async () => {
    try {
      const res = await portalApi.get<{ delaiReponseJours: number; threads: Thread[] }>("/portal/messages/threads");
      setThreads(res.threads);
      setDelai(res.delaiReponseJours);
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, []);

  useEffect(() => {
    if (!parent) return;
    void load();
    void portalApi
      .get<{ enfants: Child[] }>("/portal/me")
      .then((me) => setChildren(me.enfants))
      .catch(() => undefined);
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [parent, load]);

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
      <PageTitle subtitle={t("parent.msg.subtitle")}>{t("parent.msg.title")}</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      <p className="mb-3 rounded-xl bg-info-soft p-3 text-sm text-info">
        {t("parent.msg.notice")} {delai ? t("parent.msg.delay", { n: delai }) : ""}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setComposing((v) => !v)}>
          <MessageSquarePlus size={16} /> {t("parent.msg.new")}
        </Button>
        <Link href="/parents/annonces">
          <Button variant="secondary">{t("parent.msg.announcements")}</Button>
        </Link>
      </div>

      {composing && (
        <NewMessage
          childrenList={children}
          onDone={async (id) => {
            setComposing(false);
            await load();
            router.push(`/parents/messages/${id}`);
          }}
        />
      )}

      {!threads && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}
      {threads && threads.length === 0 && !composing && (
        <EmptyState icon={<MessagesSquare />} title={t("parent.msg.empty")} description={t("parent.msg.emptyHelp")} />
      )}

      <ul className="space-y-2.5">
        {threads?.map((th) => (
          <li key={th.id}>
            <Link href={`/parents/messages/${th.id}`}>
              <Card
                className={`transition-colors hover:border-primary/40 ${
                  th.prioriteNonLus === "URGENTE"
                    ? "border-2 border-danger bg-danger-soft"
                    : th.prioriteNonLus === "IMPORTANTE"
                      ? "border-2 border-warning bg-warning-soft"
                      : th.nonLus > 0
                        ? "border-primary/40 bg-primary-soft/40"
                        : ""
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{th.interlocuteur}</span>
                    <Badge color="primary">{th.enfant.prenom}</Badge>
                    {th.prioriteNonLus && th.prioriteNonLus !== "NORMALE" && (
                      <Badge color={PRIORITY_META[th.prioriteNonLus].badge}>{priorityText(th.prioriteNonLus)}</Badge>
                    )}
                    {th.nonLus > 0 && <Badge color="orange">{t("parent.msg.newBadge", { n: th.nonLus })}</Badge>}
                  </span>
                  {th.dernierMessage && <span className="text-xs text-ink-muted">{formatDateTime(th.dernierMessage.date)}</span>}
                </div>
                {th.dernierMessage && (
                  <p className="truncate text-sm text-ink-muted">
                    {th.dernierMessage.auteur === "PARENT" ? t("parent.msg.you") : ""}
                    {th.dernierMessage.apercu ?? t("parent.msg.removedPreview")}
                  </p>
                )}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewMessage({ childrenList, onDone }: { childrenList: Child[]; onDone: (threadId: string) => Promise<void> }) {
  const { t } = useI18n();
  const [studentId, setStudentId] = useState("");
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [who, setWho] = useState("");
  const [texte, setTexte] = useState("");
  const [priorite, setPriorite] = useState<MessagePriority>("NORMALE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContacts(null);
    setWho("");
    if (!studentId) return;
    void portalApi
      .get<Contacts>(`/portal/messages/contacts?studentId=${encodeURIComponent(studentId)}`)
      .then(setContacts)
      .catch((err) => setError(describePortalError(err)));
  }, [studentId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = who === "ecole" ? { studentId, ecole: true, texte, priorite } : { studentId, teacherId: who, texte, priorite };
      const res = await portalApi.post<{ id: string }>("/portal/messages/threads", body);
      await onDone(res.id);
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="space-y-3">
        <ErrorMessage>{error}</ErrorMessage>
        <Field label={t("parent.msg.aboutChild")}>
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">{t("parent.msg.choose")}</option>
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.prenom} {c.nom}
              </option>
            ))}
          </Select>
        </Field>
        {contacts && contacts.enseignants.length === 0 && (
          <p className="rounded-xl bg-info-soft p-3 text-sm text-info">
            {contacts.classe ? t("parent.msg.noTeacherClass", { class: contacts.classe }) : t("parent.msg.noTeacher")}
          </p>
        )}
        {contacts && (
          <Field label={t("parent.msg.whoTo")}>
            <Select value={who} onChange={(e) => setWho(e.target.value)} required>
              <option value="">{t("parent.msg.choose")}</option>
              {contacts.ecole && <option value="ecole">{t("parent.msg.schoolOption")}</option>}
              {contacts.enseignants.map((te) => (
                <option key={te.id} value={te.id}>
                  {te.prenom} {te.nom} ({te.matieres.join(", ")})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {who && (
          <>
            <Field label={t("parent.msg.yourMessage")}>
              <textarea
                className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                maxLength={2000}
                required
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
            </Field>
            <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent={false} />
            <p className="text-xs text-ink-muted">{t("parent.msg.noPhone")}</p>
            <Button type="submit" disabled={busy || !texte.trim()}>
              {t("parent.msg.send")}
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}
