"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
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
      setNotice("Annonce publiée. Les responsables de la classe sont prévenus.");
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
      setNotice("Annonce retirée. Les responsables ne la voient plus, la trace est conservée.");
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!canUse) {
    return (
      <div>
        <PageTitle eyebrow="Communication">Annonces</PageTitle>
        <p className="text-sm text-ink-muted">Vous n&apos;avez pas la permission de publier des annonces.</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle eyebrow="Communication" subtitle="Publiez une information pour tous les responsables des élèves d'une classe. Un enseignant publie pour ses classes ; la vie scolaire et la Direction pour toutes.">
        Annonces
      </PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card className="mb-6">
        <form onSubmit={publish} className="space-y-3">
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
          <Field label="Titre">
            <Input value={titre} maxLength={120} required onChange={(e) => setTitre(e.target.value)} />
          </Field>
          <Field label="Texte de l'annonce">
            <textarea className={TEXTAREA} maxLength={2000} required value={corps} onChange={(e) => setCorps(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-muted">
            Les alertes envoyées aux téléphones des responsables n&apos;indiquent jamais le titre ni le texte : ils les lisent dans l&apos;application.
          </p>
          <Button type="submit" disabled={busy || !classId || !titre.trim() || !corps.trim()}>
            <Megaphone size={16} /> Publier
          </Button>
        </form>
      </Card>

      {!items && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}
      {items && items.length === 0 && <EmptyState title="Aucune annonce." description="Les annonces publiées pour vos classes s'afficheront ici." />}
      <ul className="space-y-3">
        {items?.map((a) => (
          <li key={a.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{a.titre}</span>
                <Badge color="primary">{a.classe}</Badge>
                {a.retire && <Badge color="red">Retirée</Badge>}
              </span>
              <span className="text-xs text-ink-muted">
                {a.auteur} · {formatDateTime(a.date)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{a.corps}</p>
            {a.retire ? (
              <p className="mt-2 text-xs text-ink-muted">
                Retirée le {formatDateTime(a.retire.le)}. Motif : {a.retire.motif}
              </p>
            ) : (
              a.peutRetirer && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input className="!w-72" placeholder="Motif du retrait (obligatoire)" value={motifs[a.id] ?? ""} onChange={(e) => setMotifs({ ...motifs, [a.id]: e.target.value })} />
                  <Button variant="danger" disabled={!(motifs[a.id] ?? "").trim()} onClick={() => void withdraw(a.id)}>
                    Retirer
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
