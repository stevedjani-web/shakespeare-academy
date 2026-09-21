"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudOff, QrCode, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { listOutbox, useOnOutboxChange } from "@/lib/outbox";
import type { CheckinStatus, MyCheckins, ScanResult } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatIso } from "@/components/emploi-du-temps/shared";
import { QrScanner, extractCode } from "@/components/qr-scanner";

const TYPE_LABEL: Record<ScanResult["type"], string> = {
  DEBUT: "Début de séance enregistré",
  FIN: "Fin de séance enregistrée",
  ARRIVEE: "Arrivée enregistrée",
  DEPART: "Départ enregistré",
};

const STATUS_BADGE: Record<CheckinStatus, { label: string; color: "orange" | "green" | "red" }> = {
  EN_ATTENTE: { label: "En attente de validation", color: "orange" },
  VALIDE: { label: "Validé", color: "green" },
  REJETE: { label: "Rejeté", color: "red" },
};

function hhmm(iso: Date): string {
  return iso.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Pointage de l'enseignant (Lot 10) : scanner le QR de la salle (début et fin de chaque cours) ou de
// l'entrée de l'école (arrivée et départ). Sans Internet, le scan est gardé sur l'appareil, avec son
// heure, et confirmé à la synchronisation. Un tiers valide ensuite le pointage.
export default function PointagePage() {
  const { user, hasPermission } = useAuth();
  const canScan = hasPermission("TEACHER_CHECKIN_SELF");
  const [me, setMe] = useState<MyCheckins | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [queuedAt, setQueuedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState(0);
  const autoScanned = useRef(false);

  const load = useCallback(async () => {
    try {
      setMe(await api.get<MyCheckins>("/teacher-checkins/me"));
    } catch (err) {
      setError(describeError(err));
    }
    const entries = await listOutbox();
    const waiting = entries.filter((e) => e.kind === "checkin" && e.status === "pending" && e.userId === user?.id).length;
    setPending(waiting);
    // Tout est parti : le message « gardé sur cet appareil » n'a plus lieu d'être.
    if (waiting === 0) setQueuedAt(null);
  }, [user?.id]);

  useEffect(() => {
    if (canScan) void load();
  }, [canScan, load]);
  useOnOutboxChange(() => void load());

  const scan = useCallback(
    async (code: string) => {
      setCamera(false);
      setBusy(true);
      setError(null);
      setResult(null);
      setQueuedAt(null);
      try {
        const res = await submitOrQueue<ScanResult>(
          { kind: "checkin", method: "POST", path: "/teacher-checkins/scan", body: { code }, label: "Scan de pointage" },
          // L'heure du scan sur l'appareil accompagne le scan envoyé plus tard.
          () => ({ body: { code, scanneLe: new Date().toISOString() } }),
        );
        if (res.queued) {
          setQueuedAt(hhmm(new Date()));
        } else {
          setResult(res.result);
        }
        await load();
      } catch (err) {
        setError(describeError(err));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  // Un QR ouvert avec l'appareil photo du téléphone arrive ici avec ?c=... : on pointe tout de suite.
  useEffect(() => {
    if (!canScan || autoScanned.current) return;
    const code = new URLSearchParams(window.location.search).get("c");
    if (!code) return;
    autoScanned.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void scan(code);
  }, [canScan, scan]);

  if (!canScan) {
    return (
      <div>
        <PageTitle eyebrow="Vie scolaire">Mon pointage</PageTitle>
        <p className="text-sm text-ink-muted">Ce compte n&apos;est pas celui d&apos;un enseignant : il n&apos;a pas de pointage à faire.</p>
      </div>
    );
  }

  const journee = me?.teacher.modePointage === "JOURNEE";

  return (
    <div>
      <PageTitle
        eyebrow="Vie scolaire"
        subtitle={
          journee
            ? "Scannez le QR de l'entrée de l'école à votre arrivée et à votre départ."
            : "Scannez le QR de la salle au début et à la fin de chaque cours."
        }
      >
        Mon pointage
      </PageTitle>

      {busy && (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Enregistrement…
        </p>
      )}
      <ErrorMessage>{error}</ErrorMessage>

      {result && (
        <Card className="mb-4 border-success/40">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-success">
            <CheckCircle2 size={20} /> {TYPE_LABEL[result.type]} à {result.heure}
          </p>
          {result.seance && (
            <p className="mt-1 text-sm text-ink">
              {result.seance.className}, {result.seance.subjectName} · {result.seance.heureDebut} - {result.seance.heureFin} · {result.seance.roomName}
            </p>
          )}
          {result.retardMinutes > 0 && (
            <p className={`mt-1 text-sm ${result.retardSignale ? "text-warning" : "text-ink-muted"}`}>
              Retard de {result.retardMinutes} minute(s){result.retardSignale ? " : il sera signalé." : "."}
            </p>
          )}
          {result.ecartSalle && <p className="mt-1 text-sm text-warning">Ce n&apos;est pas la salle prévue : la vie scolaire le vérifiera.</p>}
          <p className="mt-2 text-xs text-ink-muted">En attente de validation par la vie scolaire.</p>
          {result.type === "FIN" && result.mode === "SEANCE" && (
            <p className="mt-1 text-xs text-ink-muted">Pour le cours suivant, scannez à nouveau au moment de commencer.</p>
          )}
        </Card>
      )}

      {queuedAt && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          Scan de {queuedAt} gardé sur cet appareil : il sera confirmé dès que la connexion reviendra.
        </p>
      )}
      {pending > 0 && !queuedAt && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          {pending} scan(s) en attente d&apos;envoi sur cet appareil.
        </p>
      )}

      {camera ? (
        <div className="mb-4">
          <QrScanner onCode={(code) => void scan(code)} onClose={() => setCamera(false)} />
        </div>
      ) : (
        <Button className="mb-4 w-full py-4 text-base" onClick={() => setCamera(true)} disabled={busy}>
          <ScanLine size={20} /> Scanner un QR code
        </Button>
      )}

      <Card className="mb-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const code = extractCode(manual);
            if (code) {
              setManual("");
              void scan(code);
            } else {
              setError("Ce code n'est pas valide.");
            }
          }}
        >
          <Field label="Pas de caméra ? Saisissez le code imprimé sous le QR">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Code du QR" autoComplete="off" />
          </Field>
          <Button type="submit" variant="secondary" disabled={!manual.trim() || busy}>
            <QrCode size={16} /> Pointer avec ce code
          </Button>
        </form>
      </Card>

      {!me && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}

      {me && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Aujourd&apos;hui, {formatIso(me.date)}</h2>
          {me.sansClasse && <p className="mt-2 text-sm text-ink-muted">Pas de cours : {me.sansClasse.libelle}.</p>}
          {journee ? (
            me.journee ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink">
                  Arrivée {me.journee.arrivee ?? "-"} · Départ {me.journee.depart ?? "-"}
                </span>
                <Badge color={STATUS_BADGE[me.journee.statut].color}>{STATUS_BADGE[me.journee.statut].label}</Badge>
                {me.journee.retardSignale && <Badge color="orange">Retard {me.journee.retardMinutes} min</Badge>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Aucun pointage pour l&apos;instant.</p>
            )
          ) : me.seances.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aucune séance aujourd&apos;hui.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {me.seances.map((s) => (
                <li key={s.entryId} className="rounded-xl border border-border p-2.5">
                  <p className="font-medium text-ink">
                    {s.heureDebut} - {s.heureFin} · {s.className} · {s.subjectName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <span>
                      {s.roomName} · Début {s.pointage?.debut ?? "-"} · Fin {s.pointage?.fin ?? "-"}
                    </span>
                    {s.pointage ? (
                      <Badge color={STATUS_BADGE[s.pointage.statut].color}>{STATUS_BADGE[s.pointage.statut].label}</Badge>
                    ) : (
                      <Badge color="gray">Pas encore pointée</Badge>
                    )}
                    {s.pointage?.retardSignale && <Badge color="orange">Retard {s.pointage.retardMinutes} min</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
