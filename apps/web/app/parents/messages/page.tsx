"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, PageTitle, Select, Spinner } from "@/components/ui";
import { formatDateTime } from "@/components/messaging/message-list";

interface Thread {
  id: string;
  enfant: { id: string; prenom: string };
  interlocuteur: string;
  nonLus: number;
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

const NOTICE = "Vos messages peuvent être consultés par la Direction de l'école. Les numéros de téléphone ne s'échangent pas ici. Texte seulement, sans pièce jointe.";

// Messagerie du responsable (Lot 13) : conversations avec les enseignants de la classe de son enfant et avec l'école.
export default function ParentMessagesPage() {
  const { parent, loading } = useParent();
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
      <PageTitle subtitle="Écrivez aux enseignants de la classe de votre enfant ou à l'école.">Messages</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      <p className="mb-3 rounded-xl bg-info-soft p-3 text-sm text-info">
        {NOTICE} {delai ? `Délai de réponse indicatif : ${delai} jour${delai > 1 ? "s" : ""} ouvré${delai > 1 ? "s" : ""}.` : ""}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setComposing((v) => !v)}>
          <MessageSquarePlus size={16} /> Nouveau message
        </Button>
        <Link href="/parents/annonces">
          <Button variant="secondary">Annonces de la classe</Button>
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
        <EmptyState icon={<MessagesSquare />} title="Aucune conversation." description="Écrivez un premier message avec le bouton ci-dessus." />
      )}

      <ul className="space-y-2.5">
        {threads?.map((t) => (
          <li key={t.id}>
            <Link href={`/parents/messages/${t.id}`}>
              <Card className={`transition-colors hover:border-primary/40 ${t.nonLus > 0 ? "border-primary/40 bg-primary-soft/40" : ""}`}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{t.interlocuteur}</span>
                    <Badge color="primary">{t.enfant.prenom}</Badge>
                    {t.nonLus > 0 && <Badge color="orange">{t.nonLus} nouveau{t.nonLus > 1 ? "x" : ""}</Badge>}
                  </span>
                  {t.dernierMessage && <span className="text-xs text-ink-muted">{formatDateTime(t.dernierMessage.date)}</span>}
                </div>
                {t.dernierMessage && (
                  <p className="truncate text-sm text-ink-muted">
                    {t.dernierMessage.auteur === "PARENT" ? "Vous : " : ""}
                    {t.dernierMessage.apercu ?? "Message retiré"}
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
  const [studentId, setStudentId] = useState("");
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [who, setWho] = useState("");
  const [texte, setTexte] = useState("");
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
      const body = who === "ecole" ? { studentId, ecole: true, texte } : { studentId, teacherId: who, texte };
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
        <Field label="À propos de quel enfant ?">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">Choisir…</option>
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.prenom} {c.nom}
              </option>
            ))}
          </Select>
        </Field>
        {contacts && (
          <Field label="À qui écrivez-vous ?">
            <Select value={who} onChange={(e) => setWho(e.target.value)} required>
              <option value="">Choisir…</option>
              {contacts.ecole && <option value="ecole">L&apos;école (Direction et vie scolaire)</option>}
              {contacts.enseignants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prenom} {t.nom} ({t.matieres.join(", ")})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {who && (
          <>
            <Field label="Votre message">
              <textarea
                className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                maxLength={2000}
                required
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
            </Field>
            <p className="text-xs text-ink-muted">Ne mettez pas de numéro de téléphone : ils ne s&apos;échangent pas dans la messagerie.</p>
            <Button type="submit" disabled={busy || !texte.trim()}>
              Envoyer
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}
