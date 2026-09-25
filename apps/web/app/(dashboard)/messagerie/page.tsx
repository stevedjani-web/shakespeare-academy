"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Flag, MessageSquarePlus, Send, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { MessageList, formatDateTime, type ThreadMessage } from "@/components/messaging/message-list";
import { PrioritySelect } from "@/components/messaging/priority-select";
import { AssistantSuggest } from "@/components/messaging/assistant-suggest";
import { PRIORITY_META, priorityText, type MessagePriority } from "@/lib/message-priority";

interface Thread {
  id: string;
  type: "ENSEIGNANT" | "ECOLE";
  enfant: { id: string; nom: string; prenom: string };
  responsable: { nom: string; prenom: string; lien: string | null };
  nonLus: number;
  /** La priorité la plus pressante parmi les messages non lus du responsable (null s'il n'y en a pas). */
  prioriteNonLus: MessagePriority | null;
  dernierMessage: { auteur: "PARENT" | "PERSONNEL"; apercu: string | null; date: string } | null;
}

interface ThreadView {
  id: string;
  type: "ENSEIGNANT" | "ECOLE";
  enfant: { id: string; nom: string; prenom: string };
  responsable: { nom: string; prenom: string; lien: string | null };
  peutRepondre: boolean;
  messages: ThreadMessage[];
}

interface ClassItem {
  id: string;
  nom: string;
  anneeScolaire: string;
}

interface Recipient {
  id: string;
  nom: string;
  prenom: string;
  responsables: Array<{ id: string; nom: string; prenom: string; lien: string }>;
}

interface SupervisedThread {
  id: string;
  type: "ENSEIGNANT" | "ECOLE";
  enfant: string;
  responsable: string;
  interlocuteur: string;
  nombreMessages: number;
  dernierMessageAt: string;
  signalementsOuverts: number;
}

interface SupervisedThreadView {
  id: string;
  enfant: string;
  responsable: string;
  interlocuteur: string;
  messages: Array<{
    id: string;
    auteur: string;
    cote: "PARENT" | "PERSONNEL";
    texte: string;
    priorite?: MessagePriority;
    date: string;
    retire: { le: string; par: string | null; motif: string | null } | null;
    signalementsOuverts: number;
  }>;
}

interface Report {
  id: string;
  date: string;
  signalePar: string;
  motif: string | null;
  messageId: string;
  messageDe: "PARENT" | "PERSONNEL";
  conversationId: string;
  enfant: string;
}

type Tab = "conversations" | "supervision" | "signalements";

const TEXTAREA = "min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink";

// Messagerie sécurisée du personnel (Lot 13). Un enseignant n'écrit qu'aux responsables des élèves de ses classes ;
// la vie scolaire et la Direction tiennent le guichet de l'école ; la Direction supervise (chaque lecture est journalisée).
export default function MessageriePage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canUse = hasPermission("MESSAGE_USE");
  const canSupervise = hasPermission("MESSAGE_SUPERVISE");
  const [tab, setTab] = useState<Tab>("conversations");
  const [reportsCount, setReportsCount] = useState(0);

  useEffect(() => {
    if (!canSupervise) return;
    void api
      .get<Report[]>("/messaging/supervision/reports")
      .then((r) => setReportsCount(r.length))
      .catch(() => undefined);
  }, [canSupervise, tab]);

  if (!canUse) {
    return (
      <div>
        <PageTitle eyebrow={t("acd.msg.eyebrow")}>{t("acd.msg.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("acd.msg.noPermission")}</p>
      </div>
    );
  }

  const tabClass = (key: Tab) =>
    `rounded-full px-4 py-2 text-sm font-medium ${tab === key ? "bg-primary text-white" : "border border-border bg-surface text-ink hover:bg-surface-muted"}`;

  return (
    <div>
      <PageTitle eyebrow={t("acd.msg.eyebrow")} subtitle={t("acd.msg.subtitle")} helpId="messagerie">
        {t("acd.msg.title")}
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={tabClass("conversations")} onClick={() => setTab("conversations")}>
          {t("acd.msg.tabConversations")}
        </button>
        {canSupervise && (
          <>
            <button type="button" className={tabClass("supervision")} onClick={() => setTab("supervision")}>
              <ShieldCheck size={14} className="mr-1 inline" /> {t("acd.msg.tabSupervision")}
            </button>
            <button type="button" className={tabClass("signalements")} onClick={() => setTab("signalements")}>
              <Flag size={14} className="mr-1 inline" /> {t("acd.msg.tabReports")}
              {reportsCount > 0 ? ` (${reportsCount})` : ""}
            </button>
          </>
        )}
      </div>
      {tab === "conversations" && <Conversations />}
      {tab === "supervision" && canSupervise && <Supervision />}
      {tab === "signalements" && canSupervise && <Reports onChange={setReportsCount} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------- Conversations

function Conversations() {
  const { t } = useI18n();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setThreads(await api.get<Thread[]>("/messaging/threads"));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (openId) {
    return (
      <ThreadPanel
        id={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="mb-4">
        <Button onClick={() => setComposing((v) => !v)}>
          <MessageSquarePlus size={16} /> {t("acd.msg.newMessage")}
        </Button>
      </div>
      {composing && (
        <NewThread
          onDone={(id) => {
            setComposing(false);
            setOpenId(id);
          }}
        />
      )}
      {!threads && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.msg.loading")}
        </p>
      )}
      {threads && threads.length === 0 && !composing && <EmptyState title={t("acd.msg.emptyTitle")} description={t("acd.msg.emptyDesc")} />}
      <ul className="space-y-2">
        {threads?.map((th) => (
          <li key={th.id}>
            <button
              type="button"
              onClick={() => setOpenId(th.id)}
              className={`w-full rounded-2xl border p-3 text-left hover:border-primary/40 ${
                th.prioriteNonLus === "URGENTE"
                  ? "border-2 border-danger bg-danger-soft"
                  : th.prioriteNonLus === "IMPORTANTE"
                    ? "border-2 border-warning bg-warning-soft"
                    : th.nonLus > 0
                      ? "border-primary/40 bg-primary-soft/40"
                      : "border-border bg-surface"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {th.responsable.prenom} {th.responsable.nom}
                    {th.responsable.lien ? ` (${th.responsable.lien})` : ""}
                  </span>
                  <Badge color="primary">
                    {th.enfant.prenom} {th.enfant.nom}
                  </Badge>
                  {th.type === "ECOLE" && <Badge color="slate">{t("acd.msg.desk")}</Badge>}
                  {th.prioriteNonLus && th.prioriteNonLus !== "NORMALE" && (
                    <Badge color={PRIORITY_META[th.prioriteNonLus].badge}>{priorityText(th.prioriteNonLus)}</Badge>
                  )}
                  {th.nonLus > 0 && <Badge color="orange">{t(th.nonLus > 1 ? "acd.msg.unreadMany" : "acd.msg.unreadOne", { n: th.nonLus })}</Badge>}
                </span>
                {th.dernierMessage && <span className="text-xs text-ink-muted">{formatDateTime(th.dernierMessage.date)}</span>}
              </div>
              {th.dernierMessage && (
                <p className="truncate text-sm text-ink-muted">
                  {th.dernierMessage.auteur === "PERSONNEL" ? t("acd.msg.you") : ""}
                  {th.dernierMessage.apercu ?? t("acd.msg.removedShort")}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewThread({ onDone }: { onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Recipient[]>([]);
  const [studentId, setStudentId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [texte, setTexte] = useState("");
  const [priorite, setPriorite] = useState<MessagePriority>("NORMALE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<ClassItem[]>("/messaging/classes")
      .then(setClasses)
      .catch((err) => setError(describeError(err)));
  }, []);

  useEffect(() => {
    setStudents([]);
    setStudentId("");
    setGuardianId("");
    if (!classId) return;
    void api
      .get<Recipient[]>(`/messaging/recipients?classId=${encodeURIComponent(classId)}`)
      .then(setStudents)
      .catch((err) => setError(describeError(err)));
  }, [classId]);

  const student = students.find((s) => s.id === studentId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ id: string }>("/messaging/threads", { studentId, guardianId, texte, priorite });
      onDone(res.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="space-y-3">
        <ErrorMessage>{error}</ErrorMessage>
        <Field label={t("acd.msg.new.class")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            <option value="">{t("acd.msg.choose")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.anneeScolaire})
              </option>
            ))}
          </Select>
        </Field>
        {classId && (
          <Field label={t("acd.msg.new.student")}>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">{t("acd.msg.choose")}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id} disabled={s.responsables.length === 0}>
                  {s.prenom} {s.nom}
                  {s.responsables.length === 0 ? t("acd.msg.new.noGuardian") : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {student && (
          <Field label={t("acd.msg.new.guardian")}>
            <Select value={guardianId} onChange={(e) => setGuardianId(e.target.value)} required>
              <option value="">{t("acd.msg.choose")}</option>
              {student.responsables.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.prenom} {g.nom} ({g.lien})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {guardianId && (
          <>
            <Field label={t("acd.msg.new.message")}>
              <textarea className={TEXTAREA} maxLength={2000} required value={texte} onChange={(e) => setTexte(e.target.value)} />
            </Field>
            <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent />
            <p className="text-xs text-ink-muted">{t("acd.msg.noNumber")}</p>
            <Button type="submit" disabled={busy || !texte.trim()}>
              <Send size={16} /> {t("acd.msg.send")}
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}

function ThreadPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [texte, setTexte] = useState("");
  const [priorite, setPriorite] = useState<MessagePriority>("NORMALE");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setThread(await api.get<ThreadView>(`/messaging/threads/${id}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setThread(await api.post<ThreadView>(`/messaging/threads/${id}/messages`, { texte, priorite }));
      setTexte("");
      setPriorite("NORMALE");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function report(messageId: string) {
    const motif = window.prompt(t("acd.msg.thread.reportPrompt")) ?? undefined;
    try {
      await api.post(`/messaging/messages/${messageId}/report`, motif ? { motif } : {});
      setNotice(t("acd.msg.thread.reported"));
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="mb-3">
        {t("acd.msg.thread.back")}
      </Button>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {!thread && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.msg.loading")}
        </p>
      )}
      {thread && (
        <>
          <p className="mb-3 text-sm text-ink">
            <span className="font-medium">
              {thread.responsable.prenom} {thread.responsable.nom}
              {thread.responsable.lien ? ` (${thread.responsable.lien})` : ""}
            </span>{" "}
            {t("acd.msg.thread.about", { child: `${thread.enfant.prenom} ${thread.enfant.nom}` })}
            {thread.type === "ECOLE" && <Badge color="slate"> {t("acd.msg.desk")}</Badge>}
          </p>
          <Card className="mb-4">
            <MessageList messages={thread.messages} onReport={(mid) => void report(mid)} />
          </Card>
          {thread.peutRepondre ? (
            <form onSubmit={send} className="space-y-2">
              <AssistantSuggest threadId={id} currentText={texte} onUse={setTexte} />
              <textarea className={TEXTAREA} placeholder={t("acd.msg.thread.replyPlaceholder")} maxLength={2000} value={texte} onChange={(e) => setTexte(e.target.value)} />
              <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent />
              <p className="text-xs text-ink-muted">{t("acd.msg.noNumber")}</p>
              <Button type="submit" disabled={busy || !texte.trim()}>
                <Send size={16} /> {t("acd.msg.send")}
              </Button>
            </form>
          ) : (
            <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              {t("acd.msg.thread.cannotWrite")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------ Supervision

function Supervision({ initialId }: { initialId?: string }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [threads, setThreads] = useState<SupervisedThread[] | null>(null);
  const [view, setView] = useState<SupervisedThreadView | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setThreads(await api.get<SupervisedThread[]>(`/messaging/supervision/threads${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const read = useCallback(async (id: string) => {
    try {
      // Cet appel est enregistré dans le journal d'audit : c'est une lecture supervisée.
      setView(await api.get<SupervisedThreadView>(`/messaging/supervision/threads/${id}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    if (initialId) void read(initialId);
  }, [initialId, read]);

  async function withdraw(messageId: string) {
    const motif = (motifs[messageId] ?? "").trim();
    if (!motif || !view) return;
    try {
      await api.post(`/messaging/supervision/messages/${messageId}/withdraw`, { motif });
      setNotice(t("acd.msg.sup.withdrawnNotice"));
      await read(view.id);
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (view) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setView(null)} className="mb-3">
          {t("acd.msg.sup.back")}
        </Button>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && <SuccessMessage>{notice}</SuccessMessage>}
        <p className="mb-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <Eye size={14} className="mr-1 inline" /> {t("acd.msg.sup.logged")}
        </p>
        <p className="mb-3 text-sm text-ink">
          {t("acd.msg.sup.participants", { guardian: view.responsable, other: view.interlocuteur, child: view.enfant })}
        </p>
        <ul className="space-y-3">
          {view.messages.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {t("acd.msg.sup.author", {
                  author: m.auteur,
                  side: m.cote === "PARENT" ? t("acd.msg.sup.sideGuardian") : t("acd.msg.sup.sideStaff"),
                  date: formatDateTime(m.date),
                })}
                {m.priorite && m.priorite !== "NORMALE" && (
                  <span className="ml-2 font-semibold text-ink">{priorityText(m.priorite)}</span>
                )}
                {m.signalementsOuverts > 0 && <span className="ml-2 text-danger">{t("acd.msg.sup.flagged")}</span>}
              </p>
              <p className="whitespace-pre-wrap text-sm text-ink">{m.texte}</p>
              {m.retire ? (
                <p className="mt-2 text-xs text-ink-muted">
                  {m.retire.par
                    ? t("acd.msg.sup.withdrawnOnBy", { date: formatDateTime(m.retire.le), by: m.retire.par, reason: m.retire.motif ?? "" })
                    : t("acd.msg.sup.withdrawnOn", { date: formatDateTime(m.retire.le), reason: m.retire.motif ?? "" })}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input className="!w-72" placeholder={t("acd.msg.sup.reasonPlaceholder")} value={motifs[m.id] ?? ""} onChange={(e) => setMotifs({ ...motifs, [m.id]: e.target.value })} />
                  <Button variant="danger" disabled={!(motifs[m.id] ?? "").trim()} onClick={() => void withdraw(m.id)}>
                    {t("acd.msg.sup.withdrawMessage")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <ErrorMessage>{error}</ErrorMessage>
      <p className="mb-3 text-sm text-ink-muted">
        {t("acd.msg.sup.intro")}
      </p>
      <Card className="mb-4">
        <Field label={t("acd.msg.sup.search")}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("acd.msg.sup.searchPlaceholder")} />
        </Field>
      </Card>
      {!threads && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.msg.loading")}
        </p>
      )}
      {threads && threads.length === 0 && <EmptyState title={t("acd.msg.emptyTitle")} />}
      <ul className="space-y-2">
        {threads?.map((th) => (
          <li key={th.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3">
            <div>
              <p className="text-sm font-medium text-ink">{t("acd.msg.sup.pair", { guardian: th.responsable, other: th.interlocuteur })}</p>
              <p className="text-xs text-ink-muted">
                {t("acd.msg.sup.aboutLine", {
                  child: th.enfant,
                  count: t(th.nombreMessages > 1 ? "acd.msg.sup.countMany" : "acd.msg.sup.countOne", { n: th.nombreMessages }),
                  date: formatDateTime(th.dernierMessageAt),
                })}
                {th.signalementsOuverts > 0 && (
                  <span className="ml-2 font-medium text-danger">{t("acd.msg.sup.reportsCount", { n: th.signalementsOuverts })}</span>
                )}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void read(th.id)}>
              <Eye size={16} /> {t("acd.msg.sup.read")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------ Signalements

function Reports({ onChange }: { onChange: (n: number) => void }) {
  const { t } = useI18n();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Report[]>("/messaging/supervision/reports");
      setReports(list);
      onChange(list.length);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [onChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string) {
    try {
      await api.post(`/messaging/supervision/reports/${id}/resolve`, {});
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (openThread) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setOpenThread(null)} className="mb-3">
          {t("acd.msg.rep.back")}
        </Button>
        <Supervision initialId={openThread} />
      </div>
    );
  }

  return (
    <div>
      <ErrorMessage>{error}</ErrorMessage>
      {!reports && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.msg.loading")}
        </p>
      )}
      {reports && reports.length === 0 && <EmptyState title={t("acd.msg.rep.empty")} />}
      <ul className="space-y-2">
        {reports?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-sm font-medium text-ink">
              {t("acd.msg.rep.reportedBy", { by: r.signalePar, child: r.enfant })}
            </p>
            <p className="text-xs text-ink-muted">
              {t(r.messageDe === "PARENT" ? "acd.msg.rep.fromGuardian" : "acd.msg.rep.fromStaff", { date: formatDateTime(r.date) })}
              {r.motif ? ` · ${t("acd.msg.rep.reason", { reason: r.motif })}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOpenThread(r.conversationId)}>
                <Eye size={16} /> {t("acd.msg.rep.open")}
              </Button>
              <Button variant="ghost" onClick={() => void resolve(r.id)}>
                {t("acd.msg.rep.markHandled")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
