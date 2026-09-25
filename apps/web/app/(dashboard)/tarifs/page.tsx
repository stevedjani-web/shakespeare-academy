"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { buildSection } from "@/lib/export";
import { type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandButton } from "@/components/expand";
import type { AcademicYear, FeeApplicability, FeeSchedule, FeeType, Level } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  PageTitle,
  Select,
  SuccessMessage,
} from "@/components/ui";
import { Coins, Layers, PlusCircle, Receipt } from "lucide-react";

const APPLIES_TO_KEY: Record<FeeApplicability, MessageKey> = {
  TOUS: "fin.tariffs.appliesTo.TOUS",
  INSCRIPTION: "fin.tariffs.appliesTo.INSCRIPTION",
  REINSCRIPTION: "fin.tariffs.appliesTo.REINSCRIPTION",
};

interface TarifRow {
  annee: string;
  niveau: string;
  frais: string;
  tranche: string;
  dateLimite: string;
  montant: number | null;
}

/** Tout développer / Tout réduire, pour une liste dont on connaît les identifiants. */
function ExpandAll({ ids, onChange }: { ids: string[]; onChange: (next: Set<string>) => void }) {
  const { t } = useI18n();
  if (ids.length < 2) return null;
  const cls = "rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted";
  return (
    <div className="mb-3 flex gap-2 text-sm">
      <button type="button" onClick={() => onChange(new Set(ids))} className={cls}>
        {t("common.expandAll")}
      </button>
      <button type="button" onClick={() => onChange(new Set())} className={cls}>
        {t("common.collapseAll")}
      </button>
    </div>
  );
}

type InstallmentDraft = { libelle: string; montant: string; dateLimite: string; delaiGraceJours: string };

export default function TarifsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("FEE_MANAGE");

  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [yearId, setYearId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadReference() {
    const [ft, y, cycles] = await Promise.all([
      api.get<FeeType[]>("/fee-types"),
      api.get<AcademicYear[]>("/academic-years"),
      api.get<Array<{ id: string }>>("/cycles"),
    ]);
    setFeeTypes(ft);
    setYears(y);
    setYearId((current) => current || y.find((year) => year.statut === "ACTIVE")?.id || y[0]?.id || "");

    const levelLists = await Promise.all(cycles.map((c) => api.get<Level[]>(`/levels?cycleId=${c.id}`)));
    const allLevels = levelLists.flat();
    setLevels(allLevels);
    setLevelId((current) => current || allLevels[0]?.id || "");
  }

  async function loadSchedules() {
    if (!yearId) return;
    const data = await api.get<FeeSchedule[]>(`/fee-schedules?academicYearId=${yearId}`);
    setSchedules(data);
  }

  useEffect(() => {
    void loadReference();
  }, []);

  useEffect(() => {
    void loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const schedulesForLevel = useMemo(
    () => schedules.filter((s) => !levelId || s.levelId === levelId),
    [schedules, levelId],
  );

  const tarifRows: TarifRow[] = schedulesForLevel.flatMap((sc) =>
    sc.installments.length > 0
      ? sc.installments.map((i) => ({
          annee: sc.academicYear.libelle,
          niveau: sc.level.nom,
          frais: sc.feeType.nom,
          tranche: i.libelle,
          dateLimite: formatDate(i.dateLimite),
          montant: i.montant,
        }))
      : [{ annee: sc.academicYear.libelle, niveau: sc.level.nom, frais: sc.feeType.nom, tranche: "", dateLimite: "", montant: sc.montant }],
  );

  return (
    <div>
      <PageTitle eyebrow={t("fin.eyebrow.tariffs")} subtitle={t("fin.tariffs.subtitle")} helpId="tarifs">
        {t("fin.tariffs.title")}
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <FeeTypesPanel feeTypes={feeTypes} canManage={canManage} onChanged={loadReference} />

        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Layers size={18} />
              </div>
              <h2 className="font-display text-lg font-semibold text-ink">{t("fin.tariffs.schedules")}</h2>
              <div className="ml-auto flex flex-wrap gap-2">
                <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.libelle}
                    </option>
                  ))}
                </Select>
                <ExportButtons
                  fileName={t("fin.tariffs.exportFile")}
                  title={t("fin.tariffs.exportTitle")}
                  landscape
                  disabled={schedulesForLevel.length === 0}
                  sections={[
                    buildSection(
                      t("fin.tariffs.exportTitle"),
                      [
                        { header: t("fin.tariffs.colYear"), value: (r: TarifRow) => r.annee },
                        { header: t("fin.tariffs.level"), value: (r: TarifRow) => r.niveau },
                        { header: t("fin.tariffs.feeType"), value: (r: TarifRow) => r.frais },
                        { header: t("fin.tariffs.instalment"), value: (r: TarifRow) => r.tranche },
                        { header: t("fin.tariffs.deadline"), value: (r: TarifRow) => r.dateLimite },
                        { header: t("fin.f.amount"), value: (r: TarifRow) => r.montant, kind: "money" },
                      ],
                      tarifRows,
                    ),
                  ]}
                />
                <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} className="w-auto">
                  <option value="">{t("fin.tariffs.allLevels")}</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {schedulesForLevel.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title={t("fin.tariffs.emptyTitle")}
                description={t("fin.tariffs.emptyText")}
              />
            ) : (
              <div className="space-y-2">
                <ExpandAll ids={schedulesForLevel.map((sc) => sc.id)} onChange={setOpen} />
                {schedulesForLevel.map((s) => {
                  const expanded = open.has(s.id);
                  const total = s.feeType.avecTranches
                    ? s.installments.reduce((sum, i) => sum + i.montant, 0)
                    : (s.montant ?? 0);
                  return (
                    <div key={s.id} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ExpandButton open={expanded} onClick={() => toggle(s.id)} label={s.feeType.nom} />
                          <div>
                            <p className="font-medium text-ink">{s.feeType.nom}</p>
                            <p className="text-xs text-ink-muted">
                              {s.level.nom} · {s.academicYear.libelle}
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold text-ink">{formatMontant(total)}</p>
                      </div>
                      {expanded && (
                        <div className="mt-3 border-t border-border pt-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {s.feeType.obligatoire ? (
                              <Badge color="primary">{t("fin.tariffs.mandatory")}</Badge>
                            ) : (
                              <Badge color="slate">{t("fin.tariffs.optional")}</Badge>
                            )}
                            {s.feeType.avecTranches ? <Badge color="accent">{t("fin.tariffs.instalments")}</Badge> : null}
                          </div>
                          {s.feeType.avecTranches ? (
                            <ul className="space-y-1 text-sm text-ink-muted">
                              {s.installments.map((i) => (
                                <li key={i.id} className="flex justify-between gap-3">
                                  <span>
                                    {i.libelle}
                                    <span className="ml-2 text-xs">({formatDate(i.dateLimite)})</span>
                                  </span>
                                  <span className="font-medium text-ink">{formatMontant(i.montant)}</span>
                                </li>
                              ))}
                              <li className="flex justify-between border-t border-border pt-1 font-semibold text-ink">
                                <span>{t("common.total")}</span>
                                <span>{formatMontant(total)}</span>
                              </li>
                            </ul>
                          ) : (
                            <p className="text-sm text-ink-muted">{t("fin.tariffs.singleAmount", { amount: formatMontant(total) })}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {canManage && (
            <CreateFeeSchedulePanel
              feeTypes={feeTypes}
              years={years}
              levels={levels}
              defaultYearId={yearId}
              defaultLevelId={levelId}
              existing={schedules}
              onCreated={loadSchedules}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FeeTypesPanel({
  feeTypes,
  canManage,
  onChanged,
}: {
  feeTypes: FeeType[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<{
    code: string;
    nom: string;
    obligatoire: boolean;
    avecTranches: boolean;
    appliesTo: FeeApplicability;
  }>({ code: "", nom: "", obligatoire: true, avecTranches: false, appliesTo: "TOUS" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/fee-types", form);
      setForm({ code: "", nom: "", obligatoire: true, avecTranches: false, appliesTo: "TOUS" });
      await onChanged();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
          <Coins size={18} />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">{t("fin.tariffs.feeTypes")}</h2>
      </div>

      {canManage && (
        <form onSubmit={handleCreate} className="mb-5 space-y-3 border-b border-border pb-5">
          <Field label={t("fin.tariffs.code")}>
            <Input
              required
              placeholder={t("fin.tariffs.codePlaceholder")}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={t("fin.tariffs.name")}>
            <Input
              required
              placeholder={t("fin.tariffs.namePlaceholder")}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.obligatoire}
                onChange={(e) => setForm({ ...form, obligatoire: e.target.checked })}
              />
              {t("fin.tariffs.mandatory")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.avecTranches}
                onChange={(e) => setForm({ ...form, avecTranches: e.target.checked })}
              />
              {t("fin.tariffs.splitInstalments")}
            </label>
          </div>
          <Field label={t("fin.tariffs.appliesTo")}>
            <Select
              value={form.appliesTo}
              onChange={(e) => setForm({ ...form, appliesTo: e.target.value as FeeApplicability })}
            >
              <option value="TOUS">{t("fin.tariffs.appliesTo.TOUS")}</option>
              <option value="INSCRIPTION">{t("fin.tariffs.appliesToOption.INSCRIPTION")}</option>
              <option value="REINSCRIPTION">{t("fin.tariffs.appliesToOption.REINSCRIPTION")}</option>
            </Select>
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={submitting} className="w-full">
            <PlusCircle size={16} />
            {submitting ? t("fin.tariffs.creating") : t("fin.tariffs.createFeeType")}
          </Button>
        </form>
      )}

      <ExpandAll ids={feeTypes.map((ft) => ft.id)} onChange={setOpen} />
      <ul className="space-y-2">
        {feeTypes.map((ft) => {
          const expanded = open.has(ft.id);
          return (
            <li key={ft.id} className="rounded-xl border border-border px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <ExpandButton open={expanded} onClick={() => toggle(ft.id)} label={ft.nom} />
                <p className="text-sm font-medium text-ink">{ft.nom}</p>
              </div>
              {expanded && (
                <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
                  <p className="text-xs text-ink-muted">
                    {ft.code} · {t(APPLIES_TO_KEY[ft.appliesTo])}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ft.obligatoire ? (
                      <Badge color="primary">{t("fin.tariffs.mandatory")}</Badge>
                    ) : (
                      <Badge color="slate">{t("fin.tariffs.optional")}</Badge>
                    )}
                    {ft.avecTranches && <Badge color="accent">{t("fin.tariffs.instalments")}</Badge>}
                    {ft.appliesTo !== "TOUS" && <Badge color="orange">{t(APPLIES_TO_KEY[ft.appliesTo])}</Badge>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {feeTypes.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("fin.tariffs.noFeeTypes")}</p>}
      </ul>
    </Card>
  );
}

function CreateFeeSchedulePanel({
  feeTypes,
  years,
  levels,
  defaultYearId,
  defaultLevelId,
  existing,
  onCreated,
}: {
  feeTypes: FeeType[];
  years: AcademicYear[];
  levels: Level[];
  defaultYearId: string;
  defaultLevelId: string;
  existing: FeeSchedule[];
  onCreated: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [academicYearId, setAcademicYearId] = useState(defaultYearId);
  const [levelId, setLevelId] = useState(defaultLevelId);
  const [feeTypeId, setFeeTypeId] = useState(feeTypes[0]?.id ?? "");
  const [montant, setMontant] = useState("");
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    { libelle: t("fin.tariffs.firstInstalment"), montant: "", dateLimite: "", delaiGraceJours: "0" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setAcademicYearId(defaultYearId), [defaultYearId]);
  useEffect(() => setLevelId(defaultLevelId), [defaultLevelId]);

  const selectedFeeType = feeTypes.find((ft) => ft.id === feeTypeId);
  const alreadyConfigured = existing.some(
    (s) => s.academicYearId === academicYearId && s.levelId === levelId && s.feeTypeId === feeTypeId,
  );

  function updateInstallment(index: number, patch: Partial<InstallmentDraft>) {
    setInstallments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post("/fee-schedules", {
        academicYearId,
        levelId,
        feeTypeId,
        montant: selectedFeeType?.avecTranches ? undefined : Number(montant),
        installments: selectedFeeType?.avecTranches
          ? installments.map((i, idx) => ({
              libelle: i.libelle,
              montant: Number(i.montant),
              ordre: idx + 1,
              dateLimite: i.dateLimite,
              delaiGraceJours: Number(i.delaiGraceJours || 0),
            }))
          : undefined,
      });
      setSuccess(true);
      setMontant("");
      await onCreated();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (feeTypes.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">{t("fin.tariffs.setUp")}</h2>
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("fin.tariffs.schoolYear")}>
            <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("fin.tariffs.level")}>
            <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("fin.tariffs.feeType")}>
            <Select value={feeTypeId} onChange={(e) => setFeeTypeId(e.target.value)}>
              {feeTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {selectedFeeType?.avecTranches ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">{t("fin.tariffs.instalments")}</p>
            {installments.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input
                  placeholder={t("fin.tariffs.labelPlaceholder")}
                  value={row.libelle}
                  onChange={(e) => updateInstallment(idx, { libelle: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder={t("fin.f.amount")}
                  value={row.montant}
                  onChange={(e) => updateInstallment(idx, { montant: e.target.value })}
                />
                <Input
                  type="date"
                  value={row.dateLimite}
                  onChange={(e) => updateInstallment(idx, { dateLimite: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder={t("fin.tariffs.gracePlaceholder")}
                  value={row.delaiGraceJours}
                  onChange={(e) => updateInstallment(idx, { delaiGraceJours: e.target.value })}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setInstallments((rows) => [
                    ...rows,
                    { libelle: t("fin.tariffs.nthInstalment", { n: rows.length + 1 }), montant: "", dateLimite: "", delaiGraceJours: "0" },
                  ])
                }
              >
                {t("fin.tariffs.addInstalment")}
              </Button>
              {installments.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setInstallments((rows) => rows.slice(0, -1))}
                >
                  {t("fin.tariffs.removeLast")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Field label={t("fin.f.amount")}>
            <Input
              type="number"
              required
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="25000"
            />
          </Field>
        )}

        {alreadyConfigured && (
          <p className="text-xs text-warning">
            {t("fin.tariffs.alreadyConfigured")}
          </p>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        <SuccessMessage>{success ? t("fin.tariffs.created") : null}</SuccessMessage>
        <Button type="submit" disabled={submitting || alreadyConfigured}>
          {submitting ? t("fin.saving") : t("fin.tariffs.saveFee")}
        </Button>
      </form>
    </Card>
  );
}
