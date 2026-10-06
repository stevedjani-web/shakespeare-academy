"use client";

import { useEffect, useRef, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { BankDeposit, BankDepositStatus, BankDepositSummary, ExpensePerson } from "@/lib/types";
import { openProtectedFile } from "@/lib/open-protected-file";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, StatCard, SuccessMessage } from "@/components/ui";
import { Ban, Banknote, CheckCircle2, Clock, FileText, Landmark, Paperclip, X, XCircle } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";

type Tab = BankDepositStatus | "ALL";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

const STATUS_META: Record<BankDepositStatus, { color: "orange" | "green" | "red"; icon: React.ReactNode; card: string }> = {
  EN_ATTENTE: { color: "orange", icon: <Clock size={13} />, card: "border-l-warning bg-warning-soft/40" },
  CONFIRME: { color: "green", icon: <CheckCircle2 size={13} />, card: "border-l-success bg-success-soft/40" },
  REJETE: { color: "red", icon: <XCircle size={13} />, card: "border-l-danger bg-danger-soft/40 opacity-80" },
};

const statusKey = (status: BankDepositStatus) => `fin.deposits.status.${status}` as MessageKey;
const tabKey = (tab: Tab) => `fin.deposits.tab.${tab}` as MessageKey;
const person = (p: ExpensePerson | null) => (p ? `${p.prenom} ${p.nom}` : "");
const todayIso = () => new Date().toISOString().slice(0, 10);

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("fin.deposits.needsInternet");
  return isApiError(err) ? err.message : translate("common.error");
}

function checkFile(file: File): MessageKey | null {
  const typeOk = file.type ? ALLOWED_TYPES.includes(file.type) : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return "fin.deposits.fileType";
  if (file.size > MAX_BYTES) return "fin.deposits.fileTooBig";
  return null;
}

export default function BankDepositsPage() {
  const { t } = useI18n();
  const { hasPermission, user } = useAuth();
  const canCreate = hasPermission("BANK_DEPOSIT_CREATE");
  const canVerify = hasPermission("BANK_DEPOSIT_VERIFY");

  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [summary, setSummary] = useState<BankDepositSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (canVerify ? "EN_ATTENTE" : "ALL"));
  const [form, setForm] = useState({ montant: "", dateVersement: todayIso(), banque: "", numeroBordereau: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const expanded = useExpanded();

  async function load() {
    const [list, sum] = await Promise.all([api.get<BankDeposit[]>("/bank-deposits"), api.get<BankDepositSummary>("/bank-deposits/summary")]);
    setDeposits(list);
    setSummary(sum);
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => setLoaded(true));
  }, []);

  const visible = deposits.filter((d) => tab === "ALL" || d.statut === tab);
  const count = (status: Tab) => (status === "ALL" ? deposits.length : deposits.filter((d) => d.statut === status).length);

  function pickFile(list: FileList | null) {
    const chosen = list?.[0] ?? null;
    if (fileInput.current) fileInput.current.value = "";
    if (!chosen) return;
    const problem = checkFile(chosen);
    if (problem) {
      setFile(null);
      setFileError(t(problem, { name: chosen.name }));
      return;
    }
    setFileError(null);
    setFile(chosen);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!file) {
      setError(t("fin.deposits.needFile"));
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({
          montant: Number(form.montant),
          dateVersement: form.dateVersement,
          banque: form.banque.trim(),
          numeroBordereau: form.numeroBordereau.trim(),
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
        }),
      );
      body.append("bordereau", file, file.name);
      await api.upload("/bank-deposits", body);
      setForm({ ...form, montant: "", numeroBordereau: "", note: "" });
      setFile(null);
      setFileError(null);
      setNotice(t("fin.deposits.sent"));
      setTab("EN_ATTENTE");
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function act(id: string, run: () => Promise<unknown>) {
    setActionError(null);
    setNotice(null);
    setBusyId(id);
    try {
      await run();
      await load();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  const handleConfirm = (id: string) => act(id, () => api.post(`/bank-deposits/${id}/confirm`));

  function handleReject(id: string) {
    const motif = prompt(t("fin.deposits.rejectPrompt"));
    if (!motif) return;
    void act(id, () => api.post(`/bank-deposits/${id}/reject`, { motif }));
  }

  async function openReceipt(deposit: BankDeposit) {
    const result = await openProtectedFile(`/bank-deposits/${deposit.id}/receipt`, deposit.nomAffiche);
    if (result !== "ok") setActionError(result === "offline" ? t("fin.deposits.needsInternet") : t("fin.deposits.openError"));
  }

  const tabs: Tab[] = ["EN_ATTENTE", "CONFIRME", "REJETE", "ALL"];
  const total = (status: BankDepositStatus) => deposits.filter((d) => d.statut === status).reduce((n, d) => n + d.montant, 0);

  const exportColumns = [
    { header: t("fin.deposits.date"), value: (d: BankDeposit) => formatDate(d.dateVersement) },
    { header: t("fin.deposits.bank"), value: (d: BankDeposit) => d.banque },
    { header: t("fin.deposits.slipNumber"), value: (d: BankDeposit) => d.numeroBordereau },
    { header: t("fin.f.amount"), value: (d: BankDeposit) => d.montant, kind: "money" as const },
    { header: t("fin.f.status"), value: (d: BankDeposit) => t(statusKey(d.statut)) },
    { header: t("fin.deposits.declaredBy"), value: (d: BankDeposit) => person(d.declarePar) },
    { header: t("fin.deposits.verification"), value: (d: BankDeposit) => person(d.verifiePar) },
    { header: t("fin.deposits.rejectionReason"), value: (d: BankDeposit) => d.motifRejet ?? "" },
  ];
  const exportFooter = exportColumns.map((_, i) => (i === 0 ? t("fin.deposits.totalDeposited") : i === 3 ? total("CONFIRME") + total("EN_ATTENTE") : ""));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow={t("fin.eyebrow.cash")} subtitle={t("fin.deposits.subtitle")} helpId="versements">
          {t("fin.deposits.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("fin.deposits.exportFile")}
          title={t("fin.deposits.title")}
          landscape
          disabled={!loaded}
          sections={[buildSection(t("fin.deposits.sheet"), exportColumns, deposits, exportFooter)]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("fin.deposits.statCash")}
          value={formatMontant(summary?.enCaisse ?? 0)}
          tone={(summary?.enCaisse ?? 0) > 0 ? "info" : "success"}
          icon={<Banknote size={18} />}
          hint={t("fin.deposits.statCashHint")}
        />
        <StatCard
          label={t("fin.deposits.statPending")}
          value={formatMontant(summary?.aVerifier.total ?? 0)}
          tone={(summary?.aVerifier.count ?? 0) > 0 ? "warning" : "success"}
          icon={<Clock size={18} />}
          hint={t("fin.deposits.statPendingHint", { n: summary?.aVerifier.count ?? 0 })}
        />
        <StatCard
          label={t("fin.deposits.statConfirmed")}
          value={formatMontant(summary?.confirmes.total ?? 0)}
          tone="success"
          icon={<Landmark size={18} />}
          hint={t("fin.deposits.statConfirmedHint", { n: summary?.confirmes.count ?? 0 })}
        />
        <StatCard
          label={t("fin.deposits.statRejected")}
          value={formatMontant(summary?.rejetes.total ?? 0)}
          tone="primary"
          icon={<Ban size={18} />}
          hint={t("fin.deposits.statRejectedHint", { n: summary?.rejetes.count ?? 0 })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Landmark size={18} className="text-primary" /> {t("fin.deposits.history")}
          </h2>

          <div role="tablist" aria-label={t("fin.deposits.filterAria")} className="mb-3 flex flex-wrap gap-2">
            {tabs.map((value) => {
              const active = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    active ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:bg-surface-muted"
                  }`}
                >
                  {t(tabKey(value))} <span className={active ? "text-white/80" : "text-ink-muted"}>({count(value)})</span>
                </button>
              );
            })}
          </div>

          {notice && (
            <div className="mb-3">
              <SuccessMessage>{notice}</SuccessMessage>
            </div>
          )}
          {actionError && (
            <div className="mb-3">
              <ErrorMessage>{actionError}</ErrorMessage>
            </div>
          )}

          {!loaded ? null : visible.length === 0 ? (
            <EmptyState icon={<Landmark />} title={t("fin.deposits.empty")} />
          ) : (
            <div className="space-y-2">
              <ExpandAll count={visible.length} onOpenAll={() => expanded.openAll(visible.map((x) => x.id))} onCloseAll={expanded.closeAll} />
              {visible.map((d) => {
                const meta = STATUS_META[d.statut];
                const open = expanded.isOpen(d.id);
                const busy = busyId === d.id;
                const label = `${d.banque} · ${d.numeroBordereau}`;
                return (
                  <div key={d.id} className={`rounded-xl border border-l-4 border-border p-3 ${meta.card}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ExpandButton open={open} onClick={() => expanded.toggle(d.id)} label={label} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {formatMontant(d.montant)} <span className="text-ink-muted">· {d.banque}</span>
                          </p>
                          <p className="text-xs text-ink-muted">
                            {formatDate(d.dateVersement)} · {d.numeroBordereau}
                          </p>
                        </div>
                      </div>
                      <Badge color={meta.color}>
                        <span className="flex items-center gap-1">
                          {meta.icon} {t(statusKey(d.statut))}
                        </span>
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => void openReceipt(d)}
                        aria-label={t("fin.deposits.openReceipt", { name: d.nomAffiche })}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <FileText size={13} /> {d.nomAffiche}
                      </button>
                      {d.statut === "EN_ATTENTE" && canVerify && d.declarePar.id !== user?.id && (
                        <>
                          <button disabled={busy} onClick={() => void handleConfirm(d.id)} className="text-success hover:underline disabled:opacity-50">
                            {t("fin.deposits.confirm")}
                          </button>
                          <button disabled={busy} onClick={() => handleReject(d.id)} className="text-danger hover:underline disabled:opacity-50">
                            {t("fin.deposits.reject")}
                          </button>
                        </>
                      )}
                    </div>

                    {open && (
                      <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.deposits.declaredBy")}</dt>
                          <dd className="font-medium text-ink">{person(d.declarePar)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.deposits.verification")}</dt>
                          <dd className="font-medium text-ink">
                            {d.verifiePar && d.dateVerification
                              ? t("fin.deposits.verifiedOn", { name: person(d.verifiePar), date: formatDate(d.dateVerification) })
                              : d.statut === "EN_ATTENTE"
                                ? t("fin.deposits.awaiting")
                                : "-"}
                          </dd>
                        </div>
                        {d.note && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">{t("fin.deposits.note")}</dt>
                            <dd className="font-medium text-ink">{d.note}</dd>
                          </div>
                        )}
                        {d.motifRejet && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-danger">{t("fin.deposits.rejectionReason")}</dt>
                            <dd className="font-medium text-danger">{d.motifRejet}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {canCreate && (
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">{t("fin.deposits.record")}</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label={t("fin.f.amount")}>
                <Input type="number" required min={1} value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
              </Field>
              {summary && summary.enCaisse > 0 && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, montant: String(summary.enCaisse) })}
                  className="-mt-1 text-xs font-medium text-primary hover:underline"
                >
                  {t("fin.deposits.allCash", { amount: formatMontant(summary.enCaisse) })}
                </button>
              )}
              <Field label={t("fin.deposits.date")}>
                <Input type="date" required max={todayIso()} value={form.dateVersement} onChange={(e) => setForm({ ...form, dateVersement: e.target.value })} />
              </Field>
              <Field label={t("fin.deposits.bank")}>
                <Input required minLength={2} maxLength={100} value={form.banque} onChange={(e) => setForm({ ...form, banque: e.target.value })} />
              </Field>
              <Field label={t("fin.deposits.slipNumber")}>
                <Input required maxLength={50} value={form.numeroBordereau} onChange={(e) => setForm({ ...form, numeroBordereau: e.target.value })} />
              </Field>
              <Field label={t("fin.deposits.note")}>
                <Input maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>

              <div>
                <p className="mb-1 text-sm font-medium text-ink">{t("fin.deposits.receipt")}</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => pickFile(e.target.files)}
                />
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                  <Paperclip size={15} /> {t("fin.deposits.chooseFile")}
                </Button>
                <p className="mt-1.5 text-xs text-ink-muted">{t("fin.deposits.receiptHint")}</p>
                {fileError && <p className="mt-1.5 text-xs text-danger">{fileError}</p>}
                {file && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink">
                      <FileText size={14} className="shrink-0 text-primary" />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={t("fin.deposits.removeFile", { name: file.name })}
                      onClick={() => setFile(null)}
                      className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit" disabled={submitting || !file} className="w-full">
                {submitting ? t("fin.saving") : t("fin.deposits.save")}
              </Button>
              <p className="text-xs text-ink-muted">{t("fin.deposits.needsVerification")}</p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
