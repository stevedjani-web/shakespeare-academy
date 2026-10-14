"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { openProtectedFile } from "@/lib/open-protected-file";
import { buildSection } from "@/lib/export";
import {
  methodKey,
  staffStatusKey,
  todayIso,
  type BankAccountInfo,
  type BankClaimStatus,
  type BankStudentContext,
  type BankSummary,
  type StaffBankClaim,
} from "@/lib/bank-payments";
import type { Student, StudentGuardianLink } from "@/lib/types";
import { BankDeclarationForm } from "@/components/bank-payments/declaration-form";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, StatCard, SuccessMessage } from "@/components/ui";
import { AlertTriangle, Ban, CheckCircle2, Clock, FileText, Landmark, Plus, Search, X } from "lucide-react";

type Tab = "EN_ATTENTE" | "CREDIT_CONFIRME" | "VALIDE" | "REFUSE" | "EXCEDENT" | "ALL";
const TABS: Tab[] = ["EN_ATTENTE", "CREDIT_CONFIRME", "VALIDE", "REFUSE", "EXCEDENT", "ALL"];

const STATUS_COLOR: Record<BankClaimStatus, "orange" | "blue" | "green" | "red" | "slate"> = {
  EN_ATTENTE: "orange",
  CREDIT_CONFIRME: "blue",
  VALIDE: "green",
  REJETE: "red",
  RETIRE: "slate",
};
const STATUS_CARD: Record<BankClaimStatus, string> = {
  EN_ATTENTE: "border-l-warning bg-warning-soft/40",
  CREDIT_CONFIRME: "border-l-info bg-info-soft/40",
  VALIDE: "border-l-success bg-success-soft/40",
  REJETE: "border-l-danger bg-danger-soft/40 opacity-80",
  RETIRE: "border-l-border bg-surface-muted/50 opacity-80",
};

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("bank.needsInternet");
  return isApiError(err) ? err.message : translate("common.error");
}

type StudentWithGuardians = Student & { studentGuardians?: StudentGuardianLink[] };

export default function BankPaymentsPage() {
  const { t } = useI18n();
  const { hasPermission, user } = useAuth();
  const canDeclare = hasPermission("PAYMENT_CREATE");
  const canConfirm = hasPermission("BANK_PAYMENT_CONFIRM");

  const [tab, setTab] = useState<Tab>(() => (hasPermission("BANK_PAYMENT_CONFIRM") ? "EN_ATTENTE" : "CREDIT_CONFIRME"));
  const [claims, setClaims] = useState<StaffBankClaim[]>([]);
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const expanded = useExpanded();

  const load = useCallback(async (which: Tab) => {
    const [list, sum] = await Promise.all([
      api.get<StaffBankClaim[]>(`/bank-payments${which === "ALL" ? "" : `?statut=${which}`}`),
      api.get<BankSummary>("/bank-payments/summary"),
    ]);
    setClaims(list);
    setSummary(sum);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load(tab).catch(() => setLoaded(true));
  }, [tab, load]);

  async function act(id: string, run: () => Promise<unknown>) {
    setActionError(null);
    setNotice(null);
    setBusyId(id);
    try {
      await run();
      setNotice(t("bank.staff.done"));
      await load(tab);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  function reject(id: string) {
    const motif = prompt(t("bank.staff.rejectPrompt"));
    if (!motif) return;
    void act(id, () => api.post(`/bank-payments/${id}/reject`, { motif }));
  }

  function resolveSurplus(id: string) {
    const motif = prompt(t("bank.staff.resolvePrompt"));
    if (!motif) return;
    void act(id, () => api.post(`/bank-payments/${id}/resolve-surplus`, { motif }));
  }

  async function openProof(claimId: string, proofId: string, name: string) {
    const result = await openProtectedFile(`/bank-payments/${claimId}/proofs/${proofId}`, name);
    if (result !== "ok") setActionError(result === "offline" ? t("bank.needsInternet") : t("bank.openError"));
  }

  const exportColumns = [
    { header: t("bank.staff.colDate"), value: (c: StaffBankClaim) => (c.valideLe ? formatDate(c.valideLe) : "") },
    { header: t("bank.form.method"), value: (c: StaffBankClaim) => t(methodKey(c.methode)) },
    { header: t("bank.form.bank"), value: (c: StaffBankClaim) => c.banque },
    { header: t("bank.staff.reference"), value: (c: StaffBankClaim) => c.referenceOperation },
    { header: t("fin.f.amount"), value: (c: StaffBankClaim) => c.montant, kind: "money" as const },
    { header: t("bank.staff.colStudents"), value: (c: StaffBankClaim) => [...new Set(c.lignes.map((l) => `${l.eleve.prenom} ${l.eleve.nom}`))].join(", ") },
    { header: t("bank.staff.colReceipts"), value: (c: StaffBankClaim) => c.lignes.flatMap((l) => (l.paiement ? [l.paiement.numeroRecu] : [])).join(", ") },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow={t("bank.staff.eyebrow")} subtitle={t("bank.staff.subtitle")} helpId="paiements-bancaires">
          {t("bank.staff.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("bank.staff.exportFile")}
          title={t("bank.staff.exportTitle")}
          landscape
          disabled={!loaded}
          sections={[buildSection(t("bank.staff.exportSheet"), exportColumns, claims)]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("bank.staff.statToConfirm")} value={formatMontant(summary?.aConfirmer.total ?? 0)} tone={(summary?.aConfirmer.count ?? 0) > 0 ? "warning" : "success"} icon={<Clock size={18} />} hint={t("bank.staff.statCount", { n: summary?.aConfirmer.count ?? 0 })} />
        <StatCard label={t("bank.staff.statToValidate")} value={formatMontant(summary?.aValider.total ?? 0)} tone={(summary?.aValider.count ?? 0) > 0 ? "info" : "success"} icon={<Landmark size={18} />} hint={t("bank.staff.statCount", { n: summary?.aValider.count ?? 0 })} />
        <StatCard label={t("bank.staff.statValidated")} value={formatMontant(summary?.valides.total ?? 0)} tone="success" icon={<CheckCircle2 size={18} />} hint={t("bank.staff.statCount", { n: summary?.valides.count ?? 0 })} />
        <StatCard label={t("bank.staff.statRefused")} value={formatMontant(summary?.refuses.total ?? 0)} tone="primary" icon={<Ban size={18} />} hint={t("bank.staff.statCount", { n: summary?.refuses.count ?? 0 })} />
        <StatCard label={t("bank.staff.statSurplus")} value={formatMontant(summary?.excedentsAregler.total ?? 0)} tone={(summary?.excedentsAregler.count ?? 0) > 0 ? "danger" : "success"} icon={<AlertTriangle size={18} />} hint={t("bank.staff.statCount", { n: summary?.excedentsAregler.count ?? 0 })} />
      </div>

      {canDeclare && <DeclarePanel onSent={() => { setNotice(t("bank.form.sentStaff")); setTab("EN_ATTENTE"); void load("EN_ATTENTE"); }} />}

      <Card>
        <div role="tablist" aria-label={t("bank.staff.filterAria")} className="mb-3 flex flex-wrap gap-2">
          {TABS.map((value) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:bg-surface-muted"}`}
              >
                {t(`bank.staff.tab.${value}` as never)}
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

        {!loaded ? null : claims.length === 0 ? (
          <EmptyState icon={<Landmark />} title={t("bank.staff.empty")} />
        ) : (
          <div className="space-y-2">
            <ExpandAll count={claims.length} onOpenAll={() => expanded.openAll(claims.map((c) => c.id))} onCloseAll={expanded.closeAll} />
            {claims.map((c) => {
              const open = expanded.isOpen(c.id);
              const busy = busyId === c.id;
              const mine = c.declareParId === user?.id;
              const students = [...new Set(c.lignes.map((l) => `${l.eleve.prenom} ${l.eleve.nom}`))].join(", ");
              return (
                <div key={c.id} className={`rounded-xl border border-l-4 border-border p-3 ${STATUS_CARD[c.statut]}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ExpandButton open={open} onClick={() => expanded.toggle(c.id)} label={`${c.banque} ${c.referenceOperation}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {formatMontant(c.montant)} <span className="text-ink-muted">· {t(methodKey(c.methode))} · {c.banque}</span>
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {students} · {c.referenceOperation} · {formatDate(c.dateOperation)}
                        </p>
                      </div>
                    </div>
                    <Badge color={STATUS_COLOR[c.statut]}>{t(staffStatusKey(c.statut))}</Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                    {c.preuves.map((p) => (
                      <button key={p.id} type="button" onClick={() => void openProof(c.id, p.id, p.nomAffiche)} aria-label={t("bank.staff.openProof", { name: p.nomAffiche })} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText size={13} /> {p.nomAffiche}
                      </button>
                    ))}
                    {(c.statut === "EN_ATTENTE" || c.statut === "CREDIT_CONFIRME") && (canDeclare || canConfirm) && (
                      <button type="button" disabled={busy} onClick={() => reject(c.id)} className="text-danger hover:underline disabled:opacity-50">
                        {t("bank.staff.reject")}
                      </button>
                    )}
                    {c.statut === "VALIDE" && c.excedent > 0 && !c.excedentRegle && canConfirm && (
                      <button type="button" disabled={busy} onClick={() => resolveSurplus(c.id)} className="text-warning hover:underline disabled:opacity-50">
                        {t("bank.staff.resolveSurplus")}
                      </button>
                    )}
                  </div>

                  {c.statut === "EN_ATTENTE" && (
                    <div className="mt-3">
                      {!canConfirm ? (
                        <p className="text-xs text-ink-muted">{t("bank.staff.onlyPromoter")}</p>
                      ) : mine ? (
                        <p className="text-xs text-ink-muted">{t("bank.staff.cannotConfirmOwn")}</p>
                      ) : (
                        <ConfirmForm claim={c} busy={busy} onConfirm={(body) => act(c.id, () => api.post(`/bank-payments/${c.id}/confirm`, body))} />
                      )}
                    </div>
                  )}

                  {c.statut === "CREDIT_CONFIRME" && (
                    <div className="mt-3">
                      {!canDeclare ? null : mine || c.confirmeParId === user?.id ? (
                        <p className="text-xs text-ink-muted">{t("bank.staff.cannotValidateOwn")}</p>
                      ) : (
                        <ValidateForm claim={c} busy={busy} onValidate={(body) => act(c.id, () => api.post(`/bank-payments/${c.id}/validate`, body))} />
                      )}
                    </div>
                  )}

                  {open && <ClaimDetails claim={c} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ClaimDetails({ claim: c }: { claim: StaffBankClaim }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-muted">{t("bank.staff.declaredBy")}</dt>
          <dd className="font-medium text-ink">{c.declarant.type === "PARENT" ? t("bank.staff.byParent", { name: c.declarant.nom ?? "" }) : t("bank.staff.byStaff", { name: c.declarant.nom ?? "" })}</dd>
        </div>
        {c.famille && (
          <div>
            <dt className="text-xs text-ink-muted">{t("bank.staff.family")}</dt>
            <dd className="font-medium text-ink">
              {c.famille.nom}
              {c.famille.telephone && <span className="text-ink-muted"> · {c.famille.telephone}</span>}
            </dd>
          </div>
        )}
        {c.compte && (
          <div>
            <dt className="text-xs text-ink-muted">{t("bank.staff.bankAccount")}</dt>
            <dd className="font-medium text-ink">
              {c.compte.banque} · {c.compte.titulaire}
            </dd>
          </div>
        )}
        {c.payeur && (
          <div>
            <dt className="text-xs text-ink-muted">{t("bank.staff.payer")}</dt>
            <dd className="font-medium text-ink">{c.payeur}</dd>
          </div>
        )}
        {c.note && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-muted">{t("bank.staff.note")}</dt>
            <dd className="font-medium text-ink">{c.note}</dd>
          </div>
        )}
      </dl>

      <div>
        <p className="mb-1 text-xs font-medium text-ink-muted">{t("bank.staff.lines")}</p>
        <ul className="space-y-1">
          {c.lignes.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                {l.eleve.prenom} {l.eleve.nom} · {l.classe} · {l.libelle}
              </span>
              <span className="text-xs text-ink-muted">
                {t("bank.staff.lineDeclared")} {formatMontant(l.montantDeclare)} · {t("bank.staff.lineBalance")} {formatMontant(l.soldeActuel)}
                {l.montantValide !== null && ` · ${t("bank.staff.lineValidated")} ${formatMontant(l.montantValide)}`}
                {l.paiement && ` · ${t("bank.staff.receipt", { number: l.paiement.numeroRecu })}`}
                {c.statut === "CREDIT_CONFIRME" && l.soldeActuel < l.montantDeclare && <span className="text-warning"> · {t("bank.staff.lineBalanceLow")}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {c.montantCredite !== null && c.dateCredit && (
        <p className="text-ink">
          <span className="text-xs text-ink-muted">{t("bank.staff.credit")} : </span>
          {c.referenceReleve
            ? t("bank.staff.creditLine", { amount: formatMontant(c.montantCredite), date: formatDate(c.dateCredit), ref: c.referenceReleve, name: c.confirmePar ?? "" })
            : t("bank.staff.creditLineNoRef", { amount: formatMontant(c.montantCredite), date: formatDate(c.dateCredit), name: c.confirmePar ?? "" })}
        </p>
      )}
      {c.validePar && c.valideLe && <p className="text-ink">{t("bank.staff.validatedBy", { name: c.validePar, date: formatDate(c.valideLe) })}</p>}
      {c.motifRejet && <p className="text-danger">{t("bank.staff.rejectedReason", { reason: c.motifRejet })}</p>}
      {c.excedent > 0 && (
        <p className="text-warning">
          {c.excedentRegle
            ? t("bank.staff.surplusDone", { amount: formatMontant(c.excedent), reason: c.motifRegle ?? "" })
            : t("bank.staff.surplusOpen", { amount: formatMontant(c.excedent), reason: c.motifExcedent ?? "" })}
        </p>
      )}
    </div>
  );
}

function ConfirmForm({ claim, busy, onConfirm }: { claim: StaffBankClaim; busy: boolean; onConfirm: (body: { montantCredite: number; dateCredit: string; referenceReleve?: string }) => Promise<void> }) {
  const { t } = useI18n();
  const [montant, setMontant] = useState(String(claim.montant));
  const [date, setDate] = useState(todayIso());
  const [ref, setRef] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onConfirm({ montantCredite: Math.floor(Number(montant)), dateCredit: date, ...(ref.trim() ? { referenceReleve: ref.trim() } : {}) });
      }}
      className="rounded-xl border border-border bg-surface p-3"
    >
      <p className="text-sm font-semibold text-ink">{t("bank.staff.confirmTitle")}</p>
      <p className="mb-2 text-xs text-ink-muted">{t("bank.staff.confirmHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("bank.staff.creditAmount")}>
          <Input type="number" required min={1} value={montant} onChange={(e) => setMontant(e.target.value)} />
        </Field>
        <Field label={t("bank.staff.creditDate")}>
          <Input type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("bank.staff.statementRef")}>
          <Input maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={busy} className="mt-3">
        {busy ? t("bank.staff.confirming") : t("bank.staff.confirm")}
      </Button>
    </form>
  );
}

function ValidateForm({ claim, busy, onValidate }: { claim: StaffBankClaim; busy: boolean; onValidate: (body: { allocations: { trancheId: string; montant: number }[]; motifExcedent?: string }) => Promise<void> }) {
  const { t } = useI18n();
  const credited = claim.montantCredite ?? 0;
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(claim.lignes.map((l) => [l.trancheId, String(Math.min(l.montantDeclare, l.soldeActuel))])));
  const [motif, setMotif] = useState("");
  const applied = claim.lignes.reduce((n, l) => n + Math.max(0, Math.floor(Number(amounts[l.trancheId] ?? 0)) || 0), 0);
  const surplus = Math.max(0, credited - applied);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onValidate({
          allocations: claim.lignes.map((l) => ({ trancheId: l.trancheId, montant: Math.max(0, Math.floor(Number(amounts[l.trancheId] ?? 0)) || 0) })),
          ...(surplus > 0 ? { motifExcedent: motif.trim() } : {}),
        });
      }}
      className="rounded-xl border border-border bg-surface p-3"
    >
      <p className="text-sm font-semibold text-ink">{t("bank.staff.validateTitle")}</p>
      <p className="mb-2 text-xs text-ink-muted">{t("bank.staff.validateHelp")}</p>
      <ul className="space-y-2">
        {claim.lignes.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-ink">
              {l.eleve.prenom} {l.eleve.nom} · {l.libelle}
              <span className="block text-xs text-ink-muted">
                {t("bank.staff.lineBalance")} {formatMontant(l.soldeActuel)}
              </span>
            </span>
            <Input
              type="number"
              min={0}
              max={l.soldeActuel}
              aria-label={t("bank.staff.allocated", { name: `${l.eleve.prenom} · ${l.libelle}` })}
              value={amounts[l.trancheId] ?? ""}
              onChange={(e) => setAmounts({ ...amounts, [l.trancheId]: e.target.value })}
              className="w-32"
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm font-medium text-ink">{t("bank.staff.totalAllocated", { applied: formatMontant(applied), credited: formatMontant(credited) })}</p>
      {surplus > 0 && (
        <div className="mt-2">
          <Field label={t("bank.staff.surplusReason", { amount: formatMontant(surplus) })}>
            <Input required minLength={3} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Field>
        </div>
      )}
      <Button type="submit" disabled={busy || applied <= 0 || applied > credited} className="mt-3">
        {busy ? t("bank.staff.validating") : t("bank.staff.validate")}
      </Button>
    </form>
  );
}

/** Déclaration faite par le secrétariat pour une famille : choix des élèves, puis le même formulaire que celui des parents. */
function DeclarePanel({ onSent }: { onSent: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentWithGuardians[]>([]);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<StudentWithGuardians[]>([]);
  const [contexts, setContexts] = useState<BankStudentContext[]>([]);
  const [accounts, setAccounts] = useState<BankAccountInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    void api.get<BankAccountInfo[]>("/bank-payments/accounts").then(setAccounts).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      void api
        .get<StudentWithGuardians[]>(`/students/search?q=${encodeURIComponent(query.trim())}`)
        .then((rows) => {
          setResults(rows.slice(0, 8));
          setSearched(true);
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function add(student: StudentWithGuardians) {
    if (picked.some((p) => p.id === student.id)) return;
    setError(null);
    try {
      const ctx = await api.get<BankStudentContext>(`/bank-payments/student-context/${student.id}`);
      setPicked((p) => [...p, student]);
      setContexts((c) => [...c, ctx]);
      setQuery("");
    } catch (err) {
      setError(describeError(err));
    }
  }

  function remove(id: string) {
    setPicked((p) => p.filter((s) => s.id !== id));
    setContexts((c) => c.filter((s) => s.id !== id));
  }

  const guardians = [
    ...new Map(
      picked.flatMap((s) => s.studentGuardians ?? []).map((link) => [link.guardian.id, { id: link.guardian.id, label: `${link.guardian.prenom ?? ""} ${link.guardian.nom ?? ""}`.trim() || link.guardian.telephone || link.guardian.id }]),
    ).values(),
  ];

  return (
    <Card className="mb-6">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Plus size={18} className="text-primary" /> {t("bank.staff.declareTitle")}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-ink-muted">{t("bank.staff.declareHelp")}</p>
          <div>
            <Field label={t("bank.staff.studentSearch")}>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
            </Field>
            {searched && results.length === 0 && <p className="mt-1.5 text-xs text-ink-muted">{t("bank.staff.studentSearchEmpty")}</p>}
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {results.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-ink">
                      {s.prenom} {s.nom} <span className="text-ink-muted">· {s.matricule}</span>
                    </span>
                    <button type="button" disabled={picked.some((p) => p.id === s.id)} onClick={() => void add(s)} className="text-xs font-medium text-primary hover:underline disabled:opacity-40">
                      {t("bank.staff.addStudent")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ErrorMessage>{error}</ErrorMessage>
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {picked.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-sm text-ink">
                  {s.prenom} {s.nom}
                  <button type="button" aria-label={t("bank.staff.removeStudent", { name: `${s.prenom} ${s.nom}` })} onClick={() => remove(s.id)} className="rounded-full p-0.5 text-ink-muted hover:text-danger">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {guardians.length > 0 && <p className="text-xs text-ink-muted">{t("bank.staff.pickGuardian")}</p>}

          {picked.length > 0 && (
            <BankDeclarationForm
              key={formKey}
              accounts={accounts}
              students={contexts}
              guardians={guardians}
              submit={async (body) => {
                try {
                  await api.upload("/bank-payments", body);
                } catch (err) {
                  throw new Error(describeError(err));
                }
              }}
              onSent={() => {
                setPicked([]);
                setContexts([]);
                setFormKey((k) => k + 1);
                setOpen(false);
                onSent();
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}
