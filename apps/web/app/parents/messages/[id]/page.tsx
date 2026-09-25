"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, PageTitle, Spinner, SuccessMessage } from "@/components/ui";
import { MessageList, type ThreadMessage } from "@/components/messaging/message-list";
import { PrioritySelect } from "@/components/messaging/priority-select";
import type { MessagePriority } from "@/lib/message-priority";

interface ThreadView {
  id: string;
  enfant: { id: string; prenom: string };
  interlocuteur: string;
  peutRepondre: boolean;
  delaiReponseJours: number;
  messages: ThreadMessage[];
}

export default function ParentThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, loading } = useParent();
  const router = useRouter();
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [texte, setTexte] = useState("");
  const [priorite, setPriorite] = useState<MessagePriority>("NORMALE");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const load = useCallback(async () => {
    try {
      setThread(await portalApi.get<ThreadView>(`/portal/messages/threads/${id}`));
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, [id]);

  useEffect(() => {
    if (!parent) return;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [parent, load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setThread(await portalApi.post<ThreadView>(`/portal/messages/threads/${id}/messages`, { texte, priorite }));
      setTexte("");
      setPriorite("NORMALE");
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(false);
    }
  }

  async function report(messageId: string) {
    const motif = window.prompt("Pourquoi signalez-vous ce message à la Direction ? (facultatif)") ?? undefined;
    try {
      await portalApi.post(`/portal/messages/messages/${messageId}/report`, motif ? { motif } : {});
      setNotice("Le message a été signalé à la Direction.");
      await load();
    } catch (err) {
      setError(describePortalError(err));
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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/parents/messages" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline">
          <ArrowLeft size={15} /> Toutes les conversations
        </Link>
        <Link href="/parents" className="text-sm font-medium text-primary underline">
          Mes enfants
        </Link>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {!thread && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}
      {thread && (
        <>
          <PageTitle subtitle={`À propos de ${thread.enfant.prenom}`}>{thread.interlocuteur}</PageTitle>
          <p className="mb-3 text-xs text-ink-muted">
            Les échanges peuvent être consultés par la Direction. Délai de réponse indicatif : {thread.delaiReponseJours} jour{thread.delaiReponseJours > 1 ? "s" : ""} ouvré
            {thread.delaiReponseJours > 1 ? "s" : ""}.
          </p>
          <Card className="mb-4">
            <MessageList messages={thread.messages} onReport={(mid) => void report(mid)} />
          </Card>

          {thread.peutRepondre ? (
            <form onSubmit={send} className="space-y-2">
              <textarea
                className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                placeholder="Votre réponse"
                maxLength={2000}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
              <PrioritySelect value={priorite} onChange={setPriorite} allowUrgent={false} />
              <p className="text-xs text-ink-muted">Ne mettez pas de numéro de téléphone : ils ne s&apos;échangent pas dans la messagerie.</p>
              <Button type="submit" disabled={busy || !texte.trim()}>
                <Send size={16} /> Envoyer
              </Button>
            </form>
          ) : (
            <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              <Badge color="orange">Lecture seule</Badge> Cet enseignant n&apos;est plus affecté à la classe de votre enfant. Vous pouvez écrire à l&apos;école depuis « Messages ».
            </p>
          )}
        </>
      )}
    </div>
  );
}
