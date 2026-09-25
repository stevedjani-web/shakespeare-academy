"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudOff, QrCode, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { listOutbox, useOnOutboxChange } from "@/lib/outbox";
import type { CheckinStatus, MyCheckins, ScanResult } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Spinner } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatIso } from "@/components/emploi-du-temps/shared";
import { QrScanner, extractCode } from "@/components/qr-scanner";

const TYPE_KEY: Record<ScanResult["type"], MessageKey> = {
  DEBUT: "tt.me.type.DEBUT",
  FIN: "tt.me.type.FIN",
  ARRIVEE: "tt.me.type.ARRIVEE",
  DEPART: "tt.me.type.DEPART",
};

const STATUS_BADGE: Record<CheckinStatus, { key: MessageKey; color: "orange" | "green" | "red" }> = {
  EN_ATTENTE: { key: "tt.me.status.EN_ATTENTE", color: "orange" },
  VALIDE: { key: "tt.me.status.VALIDE", color: "green" },
  REJETE: { key: "tt.me.status.REJETE", color: "red" },
};

// Pointage de l'enseignant (Lot 10) : scanner le QR de la salle (début et fin de chaque cours) ou de
// l'entrée de l'école (arrivée et départ). Sans Internet, le scan est gardé sur l'appareil, avec son
// heure, et confirmé à la synchronisation. Un tiers valide ensuite le pointage.
export default function PointagePage() {
  const { user, hasPermission } = useAuth();
  const { t, locale } = useI18n();
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

  const hhmm = useCallback(
    (d: Date): string => d.toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

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
          { kind: "checkin", method: "POST", path: "/teacher-checkins/scan", body: { code }, label: t("tt.me.scanLabel") },
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
    [load, hhmm, t],
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
        <PageTitle eyebrow={t("tt.eyebrow")}>{t("tt.me.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("tt.me.notTeacher")}</p>
      </div>
    );
  }

  const journee = me?.teacher.modePointage === "JOURNEE";

  return (
    <div>
      <PageTitle eyebrow={t("tt.eyebrow")} subtitle={journee ? t("tt.me.subtitleDay") : t("tt.me.subtitleSession")} helpId="pointage">
        {t("tt.me.title")}
      </PageTitle>

      {busy && (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("tt.me.saving")}
        </p>
      )}
      <ErrorMessage>{error}</ErrorMessage>

      {result && (
        <Card className="mb-4 border-success/40">
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-success">
            <CheckCircle2 size={20} /> {t("tt.me.resultAt", { label: t(TYPE_KEY[result.type]), time: result.heure ?? "" })}
          </p>
          {result.seance && (
            <p className="mt-1 text-sm text-ink">
              {result.seance.className}, {result.seance.subjectName} · {result.seance.heureDebut} - {result.seance.heureFin} · {result.seance.roomName}
            </p>
          )}
          {result.retardMinutes > 0 && (
            <p className={`mt-1 text-sm ${result.retardSignale ? "text-warning" : "text-ink-muted"}`}>
              {result.retardSignale
                ? t("tt.me.lateFlagged", { count: result.retardMinutes })
                : t("tt.me.late", { count: result.retardMinutes })}
            </p>
          )}
          {result.ecartSalle && <p className="mt-1 text-sm text-warning">{t("tt.me.otherRoom")}</p>}
          <p className="mt-2 text-xs text-ink-muted">{t("tt.me.awaitingValidation")}</p>
          {result.type === "FIN" && result.mode === "SEANCE" && <p className="mt-1 text-xs text-ink-muted">{t("tt.me.nextCourse")}</p>}
        </Card>
      )}

      {queuedAt && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          {t("tt.me.queuedAt", { time: queuedAt })}
        </p>
      )}
      {pending > 0 && !queuedAt && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <CloudOff size={16} className="mt-0.5 shrink-0" />
          {t("tt.me.pending", { count: pending })}
        </p>
      )}

      {camera ? (
        <div className="mb-4">
          <QrScanner onCode={(code) => void scan(code)} onClose={() => setCamera(false)} />
        </div>
      ) : (
        <Button className="mb-4 w-full py-4 text-base" onClick={() => setCamera(true)} disabled={busy}>
          <ScanLine size={20} /> {t("tt.me.scanButton")}
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
              setError(t("tt.me.invalidCode"));
            }
          }}
        >
          <Field label={t("tt.me.noCamera")}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("tt.me.codePlaceholder")} autoComplete="off" />
          </Field>
          <Button type="submit" variant="secondary" disabled={!manual.trim() || busy}>
            <QrCode size={16} /> {t("tt.me.checkWithCode")}
          </Button>
        </form>
      </Card>

      {!me && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("tt.loading")}
        </p>
      )}

      {me && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">{t("tt.me.todayHeading", { date: formatIso(me.date) })}</h2>
          {me.sansClasse && <p className="mt-2 text-sm text-ink-muted">{t("tt.me.noClass", { label: me.sansClasse.libelle })}</p>}
          {journee ? (
            me.journee ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink">
                  {t("tt.ck.arrivalDeparture", { arrival: me.journee.arrivee ?? "-", departure: me.journee.depart ?? "-" })}
                </span>
                <Badge color={STATUS_BADGE[me.journee.statut].color}>{t(STATUS_BADGE[me.journee.statut].key)}</Badge>
                {me.journee.retardSignale && <Badge color="orange">{t("tt.ck.lateMin", { min: me.journee.retardMinutes ?? 0 })}</Badge>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{t("tt.me.noCheckinYet")}</p>
            )
          ) : me.seances.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">{t("tt.me.noSessionToday")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {me.seances.map((s) => (
                <li key={s.entryId} className="rounded-xl border border-border p-2.5">
                  <p className="font-medium text-ink">
                    {s.heureDebut} - {s.heureFin} · {s.className} · {s.subjectName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <span>{t("tt.me.roomStartEnd", { room: s.roomName, start: s.pointage?.debut ?? "-", end: s.pointage?.fin ?? "-" })}</span>
                    {s.pointage ? (
                      <Badge color={STATUS_BADGE[s.pointage.statut].color}>{t(STATUS_BADGE[s.pointage.statut].key)}</Badge>
                    ) : (
                      <Badge color="gray">{t("tt.me.notYet")}</Badge>
                    )}
                    {s.pointage?.retardSignale && <Badge color="orange">{t("tt.ck.lateMin", { min: s.pointage.retardMinutes ?? 0 })}</Badge>}
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
