"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Flag, MessageSquarePlus, Send, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { MessageList, formatDateTime, type ThreadMessage } from "@/components/messaging/message-list";
import { PrioritySelect } from "@/components/messaging/priority-select";
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
const NO_NUMBER = "Ne mettez pas de numéro de téléphone : ils ne s'échangent pas dans la messagerie.";

// Messagerie sécurisée du personnel (Lot 13). Un enseignant n'écrit qu'aux responsables des élèves de ses classes ;
// la vie scolaire et la Direction tiennent le guichet de l'école ; la Direction supervise (chaque lecture est journalisée).
export default function MessageriePage() {
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
        <PageTitle eyebrow="Communication">Messagerie</PageTitle>
        <p className="text-sm text-ink-muted">Vous n&apos;avez pas la permission d&apos;utiliser la messagerie.</p>
      </div>
    );
  }

  const tabClass = (t: Tab) =>
    `rounded-full px-4 py-2 text-sm font-medium ${tab === t ? "bg-primary text-white" : "border border-border bg-surface text-ink hover:bg-surface-muted"}`;

  return (
    <div>
      <PageTitle
        eyebrow="Communication"
        subtitle="Échangez avec les responsables des élèves. Seuls les couples autorisés peuvent se parler, et aucun numéro de téléphone n'est échangé."
        helpId="messagerie"
      >
        Messagerie
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={tabClass("conversations")} onClick={() => setTab("conversations")}>
          Conversations
        </button>
        {canSupervise && (
          <>
            <button type="button" className={tabClass("supervision")} onClick={() => setTab("supervision")}>
              <ShieldCheck size={14} className="mr-1 inline" /> Supervision
            </button>
            <button type="button" className={tabClass("signalements")} onClick={() => setTab("signalements")}>
              <Flag size={14} className="mr-1 inline" /> Signalements{reportsCount > 0 ? ` (${reportsCount})` : ""}
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
          <MessageSquarePlus size={16} /> Nouveau message
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
          <Spinner /> Chargement…
        </p>
      )}
      {threads && threads.length === 0 && !composing && <EmptyState title="Aucune conversation." description="Écrivez à un responsable avec « Nouveau message »." />}
      <ul className="space-y-2">
        {threads?.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className={`w-full rounded-2xl border p-3 text-left hover:border-primary/40 ${
                t.prioriteNonLus === "URGENTE"
                  ? "border-2 border-danger bg-danger-soft"
                  : t.prioriteNonLus === "IMPORTANTE"
                    ? "border-2 border-warning bg-warning-soft"
                    : t.nonLus > 0
                      ? "border-primary/40 bg-primary-soft/40"
                      : "border-border bg-surface"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {t.responsable.prenom} {t.responsable.nom}
                    {t.responsable.lien ? ` (${t.responsable.lien})` : ""}
                  </span>
                  <Badge color="primary">
                    {t.enfant.prenom} {t.enfant.nom}
                  </Badge>
                  {t.type === "ECOLE" && <Badge color="slate">Guichet de l&apos;école</Badge>}
                  {t.prioriteNonLus && t.prioriteNonLus !== "NORMALE" && (
                    <Badge color={PRIORITY_META[t.prioriteNonLus].badge}>{priorityText(t.prioriteNonLus)}</Badge>
                  )}
                  {t.nonLus > 0 && <Badge color="orange">{t.nonLus} non lu{t.nonLus > 1 ? "s" : ""}</Badge>}
                </span>
                {t.dernierMessage && <span className="text-xs text-ink-muted">{formatDateTime(t.dernierMessage.date)}</span>}
              </div>
              {t.dernierMessage && (
                <p className="truncate text-sm text-ink-muted">
                  {t.dernierMessage.auteur === "PERSONNEL" ? "Vous : " : ""}
                  {t.dernierMessage.apercu ?? "Message retiré"}
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
        <Field label="Classe">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            <option value="">Choisir…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.anneeScolaire})
              </option>
            ))}
          </Select>
        </Field>
        {classId && (
          <Field label="Élève">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Choisir…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id} disabled={s.responsables.length === 0}>
                  {s.prenom} {s.nom}
                  {s.responsables.length === 0 ? " (aucun responsable joignable)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {student && (
          <Field label="Responsable">
            <Select value={guardianId} onChange={(e) => setGuardianId(e.target.value)} required>
              <option value="">Choisir…</option>
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
            <Field label="Message">
              <textarea className={TEXTAREA} maxLength={2000} required value={texte} onChange={(e) => setTexte(e.target.value)} />
            </Field>
            <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent />
            <p className="text-xs text-ink-muted">{NO_NUMBER}</p>
            <Button type="submit" disabled={busy || !texte.trim()}>
              <Send size={16} /> Envoyer
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}

function ThreadPanel({ id, onBack }: { id: string; onBack: () => void }) {
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
    const motif = window.prompt("Pourquoi signalez-vous ce message à la Direction ? (facultatif)") ?? undefined;
    try {
      await api.post(`/messaging/messages/${messageId}/report`, motif ? { motif } : {});
      setNotice("Le message a été signalé à la Direction.");
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="mb-3">
        Retour aux conversations
      </Button>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {!thread && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}
      {thread && (
        <>
          <p className="mb-3 text-sm text-ink">
            <span className="font-medium">
              {thread.responsable.prenom} {thread.responsable.nom}
              {thread.responsable.lien ? ` (${thread.responsable.lien})` : ""}
            </span>{" "}
            à propos de {thread.enfant.prenom} {thread.enfant.nom}
            {thread.type === "ECOLE" && <Badge color="slate"> Guichet de l&apos;école</Badge>}
          </p>
          <Card className="mb-4">
            <MessageList messages={thread.messages} onReport={(mid) => void report(mid)} />
          </Card>
          {thread.peutRepondre ? (
            <form onSubmit={send} className="space-y-2">
              <textarea className={TEXTAREA} placeholder="Votre réponse" maxLength={2000} value={texte} onChange={(e) => setTexte(e.target.value)} />
              <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent />
              <p className="text-xs text-ink-muted">{NO_NUMBER}</p>
              <Button type="submit" disabled={busy || !texte.trim()}>
                <Send size={16} /> Envoyer
              </Button>
            </form>
          ) : (
            <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              Vous ne pouvez plus écrire dans cette conversation : vous n&apos;êtes plus affecté à la classe de l&apos;élève, ou le responsable n&apos;a plus de compte actif.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------ Supervision

function Supervision({ initialId }: { initialId?: string }) {
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
      setNotice("Message retiré. Il n'est plus lisible pour les participants, sa trace est conservée.");
      await read(view.id);
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (view) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setView(null)} className="mb-3">
          Retour à la supervision
        </Button>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && <SuccessMessage>{notice}</SuccessMessage>}
        <p className="mb-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <Eye size={14} className="mr-1 inline" /> Cette lecture est enregistrée dans le journal d&apos;audit.
        </p>
        <p className="mb-3 text-sm text-ink">
          {view.responsable} et {view.interlocuteur}, à propos de {view.enfant}
        </p>
        <ul className="space-y-3">
          {view.messages.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {m.auteur} ({m.cote === "PARENT" ? "responsable" : "personnel"}) · {formatDateTime(m.date)}
                {m.priorite && m.priorite !== "NORMALE" && (
                  <span className="ml-2 font-semibold text-ink">{priorityText(m.priorite)}</span>
                )}
                {m.signalementsOuverts > 0 && <span className="ml-2 text-danger">signalé</span>}
              </p>
              <p className="whitespace-pre-wrap text-sm text-ink">{m.texte}</p>
              {m.retire ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Retiré le {formatDateTime(m.retire.le)}
                  {m.retire.par ? ` par ${m.retire.par}` : ""}. Motif : {m.retire.motif}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input className="!w-72" placeholder="Motif du retrait (obligatoire)" value={motifs[m.id] ?? ""} onChange={(e) => setMotifs({ ...motifs, [m.id]: e.target.value })} />
                  <Button variant="danger" disabled={!(motifs[m.id] ?? "").trim()} onClick={() => void withdraw(m.id)}>
                    Retirer ce message
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
        La liste ne montre que des repères. Ouvrir une conversation en affiche le contenu, et cette lecture est enregistrée dans le journal d&apos;audit.
      </p>
      <Card className="mb-4">
        <Field label="Rechercher (élève, responsable ou enseignant)">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom…" />
        </Field>
      </Card>
      {!threads && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}
      {threads && threads.length === 0 && <EmptyState title="Aucune conversation." />}
      <ul className="space-y-2">
        {threads?.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {t.responsable} et {t.interlocuteur}
              </p>
              <p className="text-xs text-ink-muted">
                À propos de {t.enfant} · {t.nombreMessages} message{t.nombreMessages > 1 ? "s" : ""} · dernier le {formatDateTime(t.dernierMessageAt)}
                {t.signalementsOuverts > 0 && <span className="ml-2 font-medium text-danger">{t.signalementsOuverts} signalement(s)</span>}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void read(t.id)}>
              <Eye size={16} /> Lire (enregistré)
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------ Signalements

function Reports({ onChange }: { onChange: (n: number) => void }) {
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
          Retour aux signalements
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
          <Spinner /> Chargement…
        </p>
      )}
      {reports && reports.length === 0 && <EmptyState title="Aucun signalement en attente." />}
      <ul className="space-y-2">
        {reports?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-sm font-medium text-ink">
              Signalé par {r.signalePar}, à propos de {r.enfant}
            </p>
            <p className="text-xs text-ink-muted">
              {formatDateTime(r.date)} · message {r.messageDe === "PARENT" ? "d'un responsable" : "du personnel"}
              {r.motif ? ` · motif : ${r.motif}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOpenThread(r.conversationId)}>
                <Eye size={16} /> Ouvrir la conversation (enregistré)
              </Button>
              <Button variant="ghost" onClick={() => void resolve(r.id)}>
                Marquer comme traité
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
