"use client";

import { useEffect, useRef, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Expense, ExpenseAttachment, ExpensePaymentMode, ExpensePerson, ExpenseStatus } from "@/lib/types";
import { EXPENSE_CATEGORY_GROUPS, categoryGroupKey, categoryKey, categoryLabel } from "@/lib/expense-categories";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, StatCard, SuccessMessage } from "@/components/ui";
import { Ban, CheckCircle2, Clock, FileText, Landmark, Paperclip, Wallet, X, XCircle } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";

type Tab = "EN_ATTENTE" | "APPROUVEE" | "DECAISSEE" | "CLOSED" | "ALL";

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;
const PAYMENT_MODES: ExpensePaymentMode[] = ["ESPECES", "VIREMENT", "CHEQUE", "MOBILE_MONEY"];

const STATUS_META: Record<ExpenseStatus, { color: "orange" | "blue" | "green" | "red" | "gray"; icon: React.ReactNode; card: string }> = {
  EN_ATTENTE: { color: "orange", icon: <Clock size={13} />, card: "border-l-warning bg-warning-soft/40" },
  APPROUVEE: { color: "blue", icon: <CheckCircle2 size={13} />, card: "border-l-info bg-info-soft/40" },
  DECAISSEE: { color: "green", icon: <Landmark size={13} />, card: "border-l-success bg-success-soft/40" },
  REJETEE: { color: "red", icon: <XCircle size={13} />, card: "border-l-danger bg-danger-soft/40 opacity-80" },
  ANNULEE: { color: "gray", icon: <Ban size={13} />, card: "border-l-border bg-surface-muted opacity-80" },
};

const TAB_STATUSES: Record<Tab, ExpenseStatus[]> = {
  EN_ATTENTE: ["EN_ATTENTE"],
  APPROUVEE: ["APPROUVEE"],
  DECAISSEE: ["DECAISSEE"],
  CLOSED: ["REJETEE", "ANNULEE"],
  ALL: ["EN_ATTENTE", "APPROUVEE", "DECAISSEE", "REJETEE", "ANNULEE"],
};

const statusKey = (status: ExpenseStatus) => `fin.expenses.status.${status}` as MessageKey;
const tabKey = (tab: Tab) => `fin.expenses.tab.${tab}` as MessageKey;
const modeKey = (mode: ExpensePaymentMode) => `fin.expenses.mode.${mode}` as MessageKey;
const person = (p: ExpensePerson | null) => (p ? `${p.prenom} ${p.nom}` : "");

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("fin.expenses.needsInternet");
  return isApiError(err) ? err.message : translate("common.error");
}

/** Contrôle d'une pièce avant l'envoi (le serveur relit le contenu : ce n'est qu'un confort, jamais la sécurité). */
function checkFile(file: File): MessageKey | null {
  const typeOk = file.type ? ALLOWED_TYPES.includes(file.type) : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return "fin.expenses.fileType";
  if (file.size > MAX_BYTES) return "fin.expenses.fileTooBig";
  return null;
}

export default function ExpensesPage() {
  const { t } = useI18n();
  const { hasPermission, user } = useAuth();
  const canCreate = hasPermission("EXPENSE_CREATE");
  const canApprove = hasPermission("EXPENSE_APPROVE");
  const canDisburse = hasPermission("EXPENSE_DISBURSE");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (canApprove ? "EN_ATTENTE" : canDisburse ? "APPROUVEE" : "ALL"));
  const [form, setForm] = useState({ categorie: "FOURNITURES", montant: "", description: "", beneficiaire: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disbursing, setDisbursing] = useState<string | null>(null);
  const [pay, setPay] = useState<{ mode: ExpensePaymentMode; reference: string; proof: File | null }>({ mode: "ESPECES", reference: "", proof: null });
  const fileInput = useRef<HTMLInputElement>(null);
  const expanded = useExpanded();

  async function load() {
    setExpenses(await api.get<Expense[]>("/expenses"));
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => setLoaded(true));
  }, []);

  const inTab = (e: Expense) => TAB_STATUSES[tab].includes(e.statut);
  const visible = expenses.filter(inTab);
  const sum = (...statuts: ExpenseStatus[]) => expenses.filter((e) => statuts.includes(e.statut)).reduce((n, e) => n + e.montant, 0);
  const count = (...statuts: ExpenseStatus[]) => expenses.filter((e) => statuts.includes(e.statut)).length;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      const problem = checkFile(file);
      if (problem) {
        setFileError(t(problem, { name: file.name }));
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(t("fin.expenses.tooManyFiles"));
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (files.length === 0) {
      setError(t("fin.expenses.needFile"));
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({
          categorie: form.categorie,
          montant: Number(form.montant),
          description: form.description,
          ...(form.beneficiaire.trim() ? { beneficiaire: form.beneficiaire.trim() } : {}),
        }),
      );
      for (const file of files) body.append("justificatif", file, file.name);
      await api.upload("/expenses", body);
      setForm({ categorie: form.categorie, montant: "", description: "", beneficiaire: "" });
      setFiles([]);
      setFileError(null);
      setNotice(t("fin.expenses.sent"));
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

  const handleApprove = (id: string) => act(id, () => api.post(`/expenses/${id}/approve`));

  function handleReject(id: string) {
    const motif = prompt(t("fin.rejectPrompt"));
    if (!motif) return;
    void act(id, () => api.post(`/expenses/${id}/reject`, { motif }));
  }

  function handleCancel(id: string) {
    const motif = prompt(t("fin.expenses.cancelPrompt"));
    if (!motif) return;
    void act(id, () => api.post(`/expenses/${id}/cancel`, { motif }));
  }

  function openDisburse(id: string) {
    setDisbursing(id);
    setPay({ mode: "ESPECES", reference: "", proof: null });
    setActionError(null);
  }

  async function handleDisburse(e: React.FormEvent, id: string) {
    e.preventDefault();
    await act(id, async () => {
      const body = new FormData();
      body.append("payload", JSON.stringify({ modePaiement: pay.mode, ...(pay.reference.trim() ? { reference: pay.reference.trim() } : {}) }));
      if (pay.proof) body.append("preuve", pay.proof, pay.proof.name);
      await api.upload(`/expenses/${id}/disburse`, body);
      setDisbursing(null);
      setTab("DECAISSEE");
    });
  }

  async function openAttachment(expenseId: string, attachment: ExpenseAttachment) {
    // La fenêtre s'ouvre tout de suite (clic de l'utilisateur) : sinon le navigateur bloque l'ouverture après l'attente.
    const win = window.open("", "_blank");
    const path = `/expenses/${expenseId}/attachments/${attachment.id}`;
    try {
      if (!win) {
        await api.download(path, attachment.nomAffiche);
        return;
      }
      const url = URL.createObjectURL(await api.blob(path));
      win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      setActionError(isOfflineError(err) ? t("fin.expenses.needsInternet") : t("fin.expenses.openError"));
    }
  }

  const tabs: Tab[] = ["EN_ATTENTE", "APPROUVEE", "DECAISSEE", "CLOSED", "ALL"];

  const exportColumns = [
    { header: t("fin.expenses.expenseDate"), value: (e: Expense) => formatDate(e.dateDepense) },
    { header: t("fin.f.category"), value: (e: Expense) => categoryLabel(t, e.categorie) },
    { header: t("fin.f.description"), value: (e: Expense) => e.description },
    { header: t("fin.expenses.beneficiaryLabel"), value: (e: Expense) => e.beneficiaire ?? "" },
    { header: t("fin.f.amount"), value: (e: Expense) => e.montant, kind: "money" as const },
    { header: t("fin.f.status"), value: (e: Expense) => t(statusKey(e.statut)) },
    { header: t("fin.expenses.enteredBy"), value: (e: Expense) => person(e.effectuePar) },
    { header: t("fin.expenses.decidedBy"), value: (e: Expense) => person(e.approbateur) },
    { header: t("fin.expenses.paidOn"), value: (e: Expense) => (e.dateDecaissement ? formatDate(e.dateDecaissement) : "") },
    { header: t("fin.expenses.mode"), value: (e: Expense) => (e.modeDecaissement ? t(modeKey(e.modeDecaissement)) : "") },
    { header: t("fin.expenses.paymentReference"), value: (e: Expense) => e.referenceDecaissement ?? "" },
    { header: t("fin.expenses.rejectionReason"), value: (e: Expense) => e.motifRejet ?? e.motifAnnulation ?? "" },
  ];
  const amountColumn = 4;
  const exportFooter = exportColumns.map((_, i) => (i === 0 ? t("fin.expenses.totalPaid") : i === amountColumn ? sum("DECAISSEE") : ""));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow={t("fin.eyebrow.cash")} subtitle={t("fin.expenses.subtitle")} helpId="depenses">
          {t("fin.expenses.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("fin.expenses.exportFile")}
          title={t("fin.expenses.title")}
          landscape
          disabled={!loaded}
          sections={[buildSection(t("fin.expenses.sheet"), exportColumns, expenses, exportFooter)]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("fin.expenses.statPending")} value={formatMontant(sum("EN_ATTENTE"))} tone="warning" icon={<Clock size={18} />} hint={t("fin.expenses.statPendingHint", { n: count("EN_ATTENTE") })} />
        <StatCard label={t("fin.expenses.statToPay")} value={formatMontant(sum("APPROUVEE"))} tone="info" icon={<CheckCircle2 size={18} />} hint={t("fin.expenses.statToPayHint", { n: count("APPROUVEE") })} />
        <StatCard label={t("fin.expenses.statPaid")} value={formatMontant(sum("DECAISSEE"))} tone="danger" icon={<Landmark size={18} />} hint={t("fin.expenses.statPaidHint", { n: count("DECAISSEE") })} />
        <StatCard label={t("fin.expenses.statClosed")} value={formatMontant(sum("REJETEE", "ANNULEE"))} tone="primary" icon={<XCircle size={18} />} hint={t("fin.expenses.statClosedHint", { n: count("REJETEE", "ANNULEE") })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Wallet size={18} className="text-primary" /> {t("fin.expenses.history")}
          </h2>

          <div role="tablist" aria-label={t("fin.expenses.filterAria")} className="mb-3 flex flex-wrap gap-2">
            {tabs.map((value) => {
              const n = count(...TAB_STATUSES[value]);
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
                  {t(tabKey(value))} <span className={active ? "text-white/80" : "text-ink-muted"}>({n})</span>
                </button>
              );
            })}
          </div>

          {notice && <div className="mb-3"><SuccessMessage>{notice}</SuccessMessage></div>}
          {actionError && <div className="mb-3"><ErrorMessage>{actionError}</ErrorMessage></div>}

          {!loaded ? null : visible.length === 0 ? (
            <EmptyState icon={<Wallet />} title={t("fin.expenses.empty")} />
          ) : (
            <div className="space-y-2">
              <ExpandAll count={visible.length} onOpenAll={() => expanded.openAll(visible.map((x) => x.id))} onCloseAll={expanded.closeAll} />
              {visible.map((exp) => {
                const meta = STATUS_META[exp.statut];
                const open = expanded.isOpen(exp.id);
                const busy = busyId === exp.id;
                const isRequester = exp.effectuePar.id === user?.id;
                const label = categoryLabel(t, exp.categorie);
                return (
                  <div key={exp.id} className={`rounded-xl border border-l-4 border-border p-3 ${meta.card}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ExpandButton open={open} onClick={() => expanded.toggle(exp.id)} label={label} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {label} · <span className="font-semibold text-danger">- {formatMontant(exp.montant)}</span>
                          </p>
                          <p className="text-xs text-ink-muted">
                            {formatDate(exp.dateDepense)}
                            {exp.beneficiaire ? ` · ${exp.beneficiaire}` : ""}
                            {exp.attachments.length > 0 && (
                              <span className="ml-2 inline-flex items-center gap-0.5">
                                <Paperclip size={11} /> {exp.attachments.length}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge color={meta.color}>
                        <span className="flex items-center gap-1">
                          {meta.icon} {t(statusKey(exp.statut))}
                        </span>
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                      {exp.statut === "EN_ATTENTE" && canApprove && (
                        <>
                          <button disabled={busy} onClick={() => void handleApprove(exp.id)} className="text-success hover:underline disabled:opacity-50">
                            {t("fin.approve")}
                          </button>
                          <button disabled={busy} onClick={() => handleReject(exp.id)} className="text-danger hover:underline disabled:opacity-50">
                            {t("fin.reject")}
                          </button>
                        </>
                      )}
                      {exp.statut === "EN_ATTENTE" && isRequester && !canApprove && (
                        <button disabled={busy} onClick={() => handleCancel(exp.id)} className="text-ink-muted hover:underline disabled:opacity-50">
                          {t("fin.expenses.withdraw")}
                        </button>
                      )}
                      {exp.statut === "APPROUVEE" && canDisburse && exp.approbateur?.id !== user?.id && disbursing !== exp.id && (
                        <button disabled={busy} onClick={() => openDisburse(exp.id)} className="text-primary hover:underline disabled:opacity-50">
                          {t("fin.expenses.confirmPay")}
                        </button>
                      )}
                      {exp.statut === "APPROUVEE" && canApprove && (
                        <button disabled={busy} onClick={() => handleCancel(exp.id)} className="text-danger hover:underline disabled:opacity-50">
                          {t("fin.expenses.cancelApproved")}
                        </button>
                      )}
                    </div>

                    {disbursing === exp.id && (
                      <form onSubmit={(e) => void handleDisburse(e, exp.id)} className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-3">
                        <p className="text-sm font-semibold text-ink">{t("fin.expenses.disburseTitle")}</p>
                        <p className="text-xs text-ink-muted">{t("fin.expenses.disburseHint", { amount: formatMontant(exp.montant) })}</p>
                        <Field label={t("fin.expenses.mode")}>
                          <Select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value as ExpensePaymentMode })}>
                            {PAYMENT_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {t(modeKey(mode))}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        {pay.mode !== "ESPECES" && (
                          <Field label={t("fin.expenses.reference")}>
                            <Input required value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={t("fin.expenses.referenceHelp")} />
                          </Field>
                        )}
                        <Field label={t("fin.expenses.proof")}>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              const problem = file ? checkFile(file) : null;
                              if (problem && file) {
                                setActionError(t(problem, { name: file.name }));
                                e.target.value = "";
                                setPay({ ...pay, proof: null });
                              } else {
                                setActionError(null);
                                setPay({ ...pay, proof: file });
                              }
                            }}
                            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" disabled={busy}>
                            {busy ? t("fin.saving") : t("fin.expenses.disburseConfirm")}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setDisbursing(null)}>
                            {t("common.close")}
                          </Button>
                        </div>
                      </form>
                    )}

                    {open && (
                      <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-ink-muted">{t("fin.f.description")}</dt>
                          <dd className="font-medium text-ink">{exp.description}</dd>
                        </div>
                        {exp.beneficiaire && (
                          <div>
                            <dt className="text-xs text-ink-muted">{t("fin.expenses.beneficiaryLabel")}</dt>
                            <dd className="font-medium text-ink">{exp.beneficiaire}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.expenses.enteredBy")}</dt>
                          <dd className="font-medium text-ink">{person(exp.effectuePar)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.expenses.decision")}</dt>
                          <dd className="font-medium text-ink">
                            {exp.approbateur
                              ? exp.dateDecision
                                ? t("fin.expenses.decidedOn", { name: person(exp.approbateur), date: formatDate(exp.dateDecision) })
                                : person(exp.approbateur)
                              : exp.statut === "EN_ATTENTE"
                                ? t("fin.expenses.awaitingManagement")
                                : "-"}
                          </dd>
                        </div>
                        {exp.motifRejet && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-danger">{t("fin.expenses.rejectionReason")}</dt>
                            <dd className="font-medium text-danger">{exp.motifRejet}</dd>
                          </div>
                        )}
                        {exp.statut === "DECAISSEE" && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">{t("fin.expenses.disbursement")}</dt>
                            <dd className="font-medium text-ink">
                              {exp.decaissePar && exp.dateDecaissement ? (
                                <>
                                  {t("fin.expenses.disbursedBy", { name: person(exp.decaissePar), date: formatDate(exp.dateDecaissement) })}
                                  {exp.modeDecaissement && ` · ${t(modeKey(exp.modeDecaissement))}`}
                                  {exp.referenceDecaissement && ` · ${t("fin.expenses.paymentReference")} ${exp.referenceDecaissement}`}
                                </>
                              ) : (
                                <span className="text-ink-muted">{t("fin.expenses.legacyDisbursed")}</span>
                              )}
                            </dd>
                          </div>
                        )}
                        {exp.statut === "ANNULEE" && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">{t("fin.expenses.cancellation")}</dt>
                            <dd className="font-medium text-ink">
                              {exp.annulePar && exp.dateAnnulation
                                ? t("fin.expenses.decidedOn", { name: person(exp.annulePar), date: formatDate(exp.dateAnnulation) })
                                : ""}
                              {exp.motifAnnulation && <span className="block text-ink-muted">{exp.motifAnnulation}</span>}
                            </dd>
                          </div>
                        )}
                        {exp.attachments.length > 0 && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-ink-muted">{t("fin.expenses.attachments")}</dt>
                            <dd>
                              <ul className="mt-1 flex flex-wrap gap-2">
                                {exp.attachments.map((att) => (
                                  <li key={att.id}>
                                    <button
                                      type="button"
                                      onClick={() => void openAttachment(exp.id, att)}
                                      aria-label={t("fin.expenses.openFile", { name: att.nomAffiche })}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
                                    >
                                      <FileText size={13} />
                                      <span className="max-w-[16rem] truncate">{att.nomAffiche}</span>
                                      <span className="text-ink-muted">· {t(`fin.expenses.kind.${att.kind}` as MessageKey)}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </dd>
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
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">{t("fin.expenses.record")}</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label={t("fin.f.category")}>
                <Select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
                  {EXPENSE_CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.group} label={t(categoryGroupKey(g.group))}>
                      {g.codes.map((code) => (
                        <option key={code} value={code}>
                          {t(categoryKey(code))}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label={t("fin.f.amount")}>
                <Input type="number" required min={1} value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
              </Field>
              <Field label={t("fin.f.description")}>
                <Input required maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("fin.expenses.detailPlaceholder")} />
              </Field>
              <Field label={t("fin.expenses.beneficiary")}>
                <Input maxLength={150} value={form.beneficiaire} onChange={(e) => setForm({ ...form, beneficiaire: e.target.value })} />
              </Field>

              <div>
                <p className="mb-1 text-sm font-medium text-ink">{t("fin.expenses.docs")}</p>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
                  <Paperclip size={15} /> {t("fin.expenses.chooseFiles")}
                </Button>
                <p className="mt-1.5 text-xs text-ink-muted">{t("fin.expenses.docsHint")}</p>
                {fileError && <p className="mt-1.5 text-xs text-danger">{fileError}</p>}
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5 text-ink">
                          <FileText size={14} className="shrink-0 text-primary" />
                          <span className="truncate">{file.name}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={t("fin.expenses.removeFile", { name: file.name })}
                          onClick={() => setFiles(files.filter((_, i) => i !== index))}
                          className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit" disabled={submitting || files.length === 0} className="w-full">
                {submitting ? t("fin.saving") : t("fin.expenses.save")}
              </Button>
              <p className="text-xs text-ink-muted">{t("fin.expenses.needsApproval")}</p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
