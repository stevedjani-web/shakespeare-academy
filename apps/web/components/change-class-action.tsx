"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { formatMontant } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import { isApiError } from "@/contexts/auth-context";
import { Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import type { Class, Enrollment, Level } from "@/lib/types";

interface RealignedLine {
  ligneId: string;
  libelle: string;
  ancienLibelle: string;
  ancienMontant: number;
  nouveauMontant: number;
  payee: boolean;
}

interface Simulation {
  simulation: true;
  niveauChange: boolean;
  ancienneClasse: string;
  nouvelleClasse: string;
  facture: {
    modifiees: RealignedLine[];
    ajoutees: { libelle: string; montant: number }[];
    nonConcernees: string[];
    totalAvant: number;
    totalApres: number;
    impactFinancier: boolean;
    blocages: string[];
  } | null;
  droitTarifsManquant: boolean;
  notesDansAncienneClasse: number;
  appelsDansAncienneClasse: number;
}

/**
 * Corrige la classe d'une inscription active, y compris vers un autre niveau (élève rétrogradé ou surclassé par
 * erreur). Avant de valider, montre ce que le serveur ferait de la facture (`simuler`) : rien n'est modifié tant que
 * l'utilisateur n'a pas confirmé, et un changement de niveau demande un motif.
 */
export function ChangeClassAction({
  enrollment,
  studentName,
  onChanged,
}: {
  enrollment: Enrollment;
  studentName: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [classId, setClassId] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [checking, setChecking] = useState(false);
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  async function start() {
    setError(null);
    setOpen(true);
    try {
      const [c, l] = await Promise.all([
        api.get<Class[]>(`/classes?academicYearId=${enrollment.academicYear.id}`),
        api.get<Level[]>("/levels"),
      ]);
      setClasses(c.filter((k) => k.id !== enrollment.class.id));
      setLevels(l);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("stu.doss.errGeneric"));
    }
  }

  // Un niveau par groupe, dans l'ordre de l'école.
  const groups = useMemo(() => {
    const byLevel = new Map<string, Class[]>();
    for (const k of classes) byLevel.set(k.levelId, [...(byLevel.get(k.levelId) ?? []), k]);
    return [...levels]
      .sort((a, b) => a.ordre - b.ordre)
      .filter((l) => byLevel.has(l.id))
      .map((l) => ({ level: l, classes: byLevel.get(l.id)! }));
  }, [classes, levels]);

  useEffect(() => {
    setSimulation(null);
    if (!open || !classId) return;
    const id = ++request.current;
    setChecking(true);
    setError(null);
    api
      .post<Simulation>(`/enrollments/${enrollment.id}/change-class`, { classId, simuler: true })
      .then((res) => {
        if (id === request.current) setSimulation(res);
      })
      .catch((err) => {
        if (id === request.current) setError(isApiError(err) ? err.message : t("stu.doss.errGeneric"));
      })
      .finally(() => {
        if (id === request.current) setChecking(false);
      });
  }, [classId, open, enrollment.id, t]);

  function close() {
    request.current++;
    setOpen(false);
    setClassId("");
    setSimulation(null);
    setMotif("");
    setError(null);
  }

  const levelChange = simulation?.niveauChange ?? false;
  const blocked = (simulation?.facture?.blocages.length ?? 0) > 0 || Boolean(simulation?.droitTarifsManquant);
  const canConfirm = Boolean(simulation) && !blocked && !saving && (!levelChange || motif.trim().length >= 3);

  async function confirm() {
    if (!simulation) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/enrollments/${enrollment.id}/change-class`, {
        classId,
        ...(levelChange ? { motif: motif.trim() } : {}),
      });
      close();
      await onChanged();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("stu.doss.errGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => void start()}>
        <Pencil size={14} /> {t("stu.chg.open")}
      </Button>
    );
  }

  const f = simulation?.facture;
  return (
    <div className="w-full max-w-xl space-y-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
      <p className="font-semibold text-ink">{t("stu.chg.title", { nom: studentName })}</p>
      <p className="text-xs text-ink-muted">{t("stu.chg.intro")}</p>
      <p className="text-xs text-ink-muted">{t("stu.chg.current", { classe: enrollment.class.nom })}</p>

      <Field label={t("stu.chg.pick")}>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("stu.chg.choose")}</option>
          {groups.map((g) => (
            <optgroup key={g.level.id} label={g.level.nom}>
              {g.classes.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nom}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {checking && <p className="text-xs text-ink-muted">{t("stu.chg.checking")}</p>}

      {simulation && !checking && (
        <div className="space-y-2">
          <p className={levelChange ? "font-medium text-warning" : "text-ink-muted"}>
            {levelChange ? t("stu.chg.levelChange") : t("stu.chg.sameLevel")}
          </p>

          {f && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-2.5">
              {f.totalApres === f.totalAvant ? (
                <p className="font-medium">{t("stu.chg.totalSame", { total: formatMontant(f.totalAvant) })}</p>
              ) : (
                <p className="font-medium">
                  {t("stu.chg.total")} : {formatMontant(f.totalAvant)} → {formatMontant(f.totalApres)}
                </p>
              )}
              {f.modifiees.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted">{t("stu.chg.linesChanged")}</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {f.modifiees.map((l) => (
                      <li key={l.ligneId}>
                        {l.libelle} : {formatMontant(l.ancienMontant)} → {formatMontant(l.nouveauMontant)}
                        {l.payee && <span className="text-ink-muted"> ({t("stu.chg.lineWasPaid")})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {f.ajoutees.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted">{t("stu.chg.linesAdded")}</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {f.ajoutees.map((l) => (
                      <li key={l.libelle}>
                        {l.libelle} : {formatMontant(l.montant)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {f.nonConcernees.length > 0 && (
                <p className="text-xs text-ink-muted">{t("stu.chg.linesKept", { liste: f.nonConcernees.join(", ") })}</p>
              )}
            </div>
          )}

          {f && f.blocages.length > 0 && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              <p className="font-semibold">{t("stu.chg.blocked")}</p>
              <ul className="mt-1 list-disc pl-4">
                {f.blocages.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {simulation.droitTarifsManquant && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{t("stu.chg.needFeeRight")}</p>
          )}
          {(simulation.notesDansAncienneClasse > 0 || simulation.appelsDansAncienneClasse > 0) && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              {t("stu.chg.dataKept", {
                notes: simulation.notesDansAncienneClasse,
                appels: simulation.appelsDansAncienneClasse,
                classe: simulation.ancienneClasse,
              })}
            </p>
          )}

          {levelChange && (
            <Field label={t("stu.chg.reason")}>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("stu.chg.reasonHint")} maxLength={200} />
            </Field>
          )}
        </div>
      )}

      <ErrorMessage>{error}</ErrorMessage>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void confirm()} disabled={!canConfirm}>
          {t("stu.chg.confirm")}
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          {t("stu.chg.cancel")}
        </Button>
      </div>
    </div>
  );
}
