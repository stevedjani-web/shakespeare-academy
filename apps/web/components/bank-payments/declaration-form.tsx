"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { formatDate, formatMontant } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  BANK_METHODS,
  MAX_PROOFS,
  checkProofFile,
  methodKey,
  referenceKey,
  todayIso,
  type BankAccountInfo,
  type BankMethod,
  type BankStudentContext,
} from "@/lib/bank-payments";
import { Badge, Button, ErrorMessage, Field, Input, Select } from "@/components/ui";

interface Props {
  accounts: BankAccountInfo[];
  students: BankStudentContext[];
  /** Responsables proposés au secrétariat (la famille verra la déclaration dans son espace). */
  guardians?: { id: string; label: string }[];
  /** Envoie la déclaration (multipart déjà construit) ; lève l'erreur à afficher. */
  submit: (body: FormData) => Promise<void>;
  /** Appelé après un envoi réussi. */
  onSent: () => void;
}

/**
 * Déclaration d'un paiement par banque, commune à l'espace parents et au secrétariat. Une preuve peut couvrir plusieurs
 * tranches et plusieurs enfants : on indique la part de chaque tranche, la somme est le montant déclaré. Rien n'est un
 * paiement avant la confirmation du crédit puis la validation (le serveur contrôle tout, ceci évite un envoi voué à l'échec).
 */
export function BankDeclarationForm({ accounts, students, guardians, submit, onSent }: Props) {
  const { t } = useI18n();
  const [methode, setMethode] = useState<BankMethod>("VIREMENT");
  const [compteId, setCompteId] = useState("");
  const [banque, setBanque] = useState("");
  const [reference, setReference] = useState("");
  const [dateOperation, setDateOperation] = useState(todayIso());
  const [payeur, setPayeur] = useState("");
  const [note, setNote] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const tranches = students.flatMap((s) => s.tranches.map((tr) => ({ ...tr, student: s })));
  const lines = tranches
    .map((tr) => ({ tr, montant: Math.floor(Number(amounts[tr.trancheId] ?? 0)) }))
    .filter((l) => Number.isFinite(l.montant) && l.montant > 0);
  const total = lines.reduce((n, l) => n + l.montant, 0);
  const needsAccount = methode !== "CHEQUE";

  function pickFiles(list: FileList | null) {
    // Copie d'abord : vider le champ (pour pouvoir rechoisir le même fichier) peut vider la liste d'origine.
    const chosen = list ? Array.from(list) : [];
    if (fileInput.current) fileInput.current.value = "";
    if (chosen.length === 0) return;
    const next = [...files];
    setFileError(null);
    for (const file of chosen) {
      const problem = checkProofFile(file);
      if (problem) {
        setFileError(t(problem, { name: file.name }));
        continue;
      }
      if (next.length >= MAX_PROOFS) {
        setFileError(t("bank.form.tooManyFiles"));
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  function validate(): string | null {
    if (lines.length === 0) return t("bank.form.needLines");
    for (const l of lines) {
      if (l.montant > l.tr.disponible) {
        return t("bank.form.tooMuch", { name: `${l.tr.student.prenom} · ${l.tr.libelle}`, amount: formatMontant(l.tr.disponible) });
      }
    }
    if (needsAccount && !compteId) return t("bank.form.needAccount");
    if (dateOperation > todayIso()) return t("bank.form.futureDate");
    if (files.length === 0) return t("bank.form.needFile");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const body = new FormData();
    body.append(
      "payload",
      JSON.stringify({
        methode,
        montant: total,
        banque: banque.trim(),
        ...(compteId ? { compteId } : {}),
        referenceOperation: reference.trim(),
        dateOperation,
        ...(payeur.trim() ? { payeur: payeur.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(guardianId ? { guardianId } : {}),
        lignes: lines.map((l) => ({ trancheId: l.tr.trancheId, montant: l.montant })),
      }),
    );
    for (const file of files) body.append("preuve", file, file.name);
    setSending(true);
    try {
      await submit(body);
      setAmounts({});
      setFiles([]);
      setReference("");
      setNote("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSending(false);
    }
  }

  if (tranches.length === 0) {
    return <p className="text-sm text-ink-muted">{t("bank.form.noTranches")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">{t("bank.form.method")}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {BANK_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={methode === m}
              onClick={() => setMethode(m)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                methode === m ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:bg-surface-muted"
              }`}
            >
              {t(methodKey(m))}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("bank.form.account")}>
          <Select value={compteId} onChange={(e) => setCompteId(e.target.value)} required={needsAccount}>
            <option value="">{t("bank.form.accountPick")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.banque} · {a.titulaire}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("bank.form.bank")}>
          <Input required minLength={2} maxLength={80} value={banque} onChange={(e) => setBanque(e.target.value)} />
        </Field>
        <Field label={t(referenceKey(methode))}>
          <Input required minLength={2} maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label={t("bank.form.date")}>
          <Input type="date" required max={todayIso()} value={dateOperation} onChange={(e) => setDateOperation(e.target.value)} />
        </Field>
        <Field label={t("bank.form.payer")}>
          <Input maxLength={120} value={payeur} onChange={(e) => setPayeur(e.target.value)} />
        </Field>
        {guardians && guardians.length > 0 && (
          <Field label={t("bank.staff.family")}>
            <Select value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
              <option value="">{t("bank.staff.guardianNone")}</option>
              {guardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <p className="-mt-2 text-xs text-ink-muted">{t("bank.form.bankHint")}</p>

      <fieldset>
        <legend className="text-sm font-medium text-ink">{t("bank.form.lines")}</legend>
        <p className="mb-2 text-xs text-ink-muted">{t("bank.form.linesHint")}</p>
        <div className="space-y-2">
          {students
            .filter((s) => s.tranches.length > 0)
            .map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-semibold text-ink">
                  {s.prenom} {s.nom}
                </p>
                <ul className="space-y-2">
                  {s.tranches.map((tr) => (
                    <li key={tr.trancheId} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          {tr.libelle} {tr.enRetard && <Badge color="red">{t("bank.form.late")}</Badge>}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {t("bank.form.available", { amount: formatMontant(tr.disponible) })} · {formatDate(tr.dateLimite)}
                          {tr.enCours > 0 && ` · ${t("bank.form.inProgress", { amount: formatMontant(tr.enCours) })}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={tr.disponible}
                          inputMode="numeric"
                          disabled={tr.disponible <= 0}
                          aria-label={`${s.prenom} · ${tr.libelle}`}
                          value={amounts[tr.trancheId] ?? ""}
                          onChange={(e) => setAmounts({ ...amounts, [tr.trancheId]: e.target.value })}
                          className="w-32"
                        />
                        <button
                          type="button"
                          disabled={tr.disponible <= 0}
                          onClick={() => setAmounts({ ...amounts, [tr.trancheId]: String(tr.disponible) })}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-40"
                        >
                          {t("bank.form.all")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        <p className="mt-2 text-sm font-semibold text-ink">{t("bank.form.total", { amount: formatMontant(total) })}</p>
      </fieldset>

      <Field label={t("bank.form.note")}>
        <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div>
        <p className="text-sm font-medium text-ink">{t("bank.form.proofs")}</p>
        <p className="mb-2 text-xs text-ink-muted">{t("bank.form.proofsHint")}</p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => pickFiles(e.target.files)}
        />
        <Button type="button" variant="secondary" disabled={files.length >= MAX_PROOFS} onClick={() => fileInput.current?.click()}>
          <Paperclip size={15} /> {t("bank.form.addFile")}
        </Button>
        <p className="mt-1.5 text-xs text-ink-muted">{t("bank.form.proofsPrivacy")}</p>
        {fileError && <p className="mt-1.5 text-xs text-danger">{fileError}</p>}
        <ul className="mt-2 space-y-1.5">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-ink">
                <FileText size={14} className="shrink-0 text-primary" />
                <span className="truncate">{file.name}</span>
              </span>
              <button
                type="button"
                aria-label={t("bank.form.removeFile", { name: file.name })}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" disabled={sending} className="w-full sm:w-auto">
        {sending ? t("bank.form.sending") : t("bank.form.submit")}
      </Button>
      <p className="text-xs text-ink-muted">{t("bank.form.noDeclaredOnClose")}</p>
    </form>
  );
}
