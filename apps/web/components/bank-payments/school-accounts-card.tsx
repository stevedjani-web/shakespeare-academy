"use client";

import { useEffect, useState } from "react";
import { Building } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { SchoolBankAccount } from "@/lib/bank-payments";
import { Badge, Button, Card, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";

/** Comptes bancaires de l'école : l'Administrateur les saisit, les parents les voient dans leur espace (paiement par banque). */
export function SchoolBankAccountsCard({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<SchoolBankAccount[]>([]);
  const [form, setForm] = useState({ banque: "", titulaire: "", numero: "", instructions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setAccounts(await api.get<SchoolBankAccount[]>("/school-bank-accounts"));
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  const describe = (err: unknown) => (isApiError(err) ? err.message : t("common.error"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/school-bank-accounts", {
        banque: form.banque.trim(),
        titulaire: form.titulaire.trim(),
        numero: form.numero.trim(),
        ...(form.instructions.trim() ? { instructions: form.instructions.trim() } : {}),
      });
      setForm({ banque: "", titulaire: "", numero: "", instructions: "" });
      setNotice(t("bank.acc.added"));
      await load();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: SchoolBankAccount) {
    setError(null);
    try {
      await api.patch(`/school-bank-accounts/${a.id}`, { actif: !a.actif });
      await load();
    } catch (err) {
      setError(describe(err));
    }
  }

  async function remove(a: SchoolBankAccount) {
    if (!confirm(t("bank.acc.deleteConfirm"))) return;
    setError(null);
    try {
      await api.delete(`/school-bank-accounts/${a.id}`);
      await load();
    } catch (err) {
      setError(describe(err));
    }
  }

  return (
    <Card className="mb-4 max-w-xl">
      <div className="flex items-center gap-2.5">
        <Building size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-ink">{t("bank.acc.title")}</h2>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t("bank.acc.help")}</p>
      {!canManage && <p className="mt-2 text-xs text-ink-muted">{t("bank.acc.cannotManage")}</p>}

      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{t("bank.acc.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{a.banque}</p>
                  <p className="text-xs text-ink-muted">{a.titulaire}</p>
                  <code className="break-all text-xs text-ink">{a.numero}</code>
                  {a.instructions && <p className="mt-1 text-xs text-ink-muted">{a.instructions}</p>}
                </div>
                <Badge color={a.actif ? "green" : "slate"}>{a.actif ? t("bank.acc.activeBadge") : t("bank.acc.inactiveBadge")}</Badge>
              </div>
              {canManage && (
                <div className="mt-2 flex gap-4 text-xs font-medium">
                  <button type="button" onClick={() => void toggle(a)} className="text-primary hover:underline">
                    {a.actif ? t("bank.acc.deactivate") : t("bank.acc.activate")}
                  </button>
                  <button type="button" onClick={() => void remove(a)} className="text-danger hover:underline">
                    {t("bank.acc.delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={(e) => void add(e)} className="mt-4 space-y-3 border-t border-border pt-4">
          <Field label={t("bank.acc.bank")}>
            <Input required minLength={2} maxLength={80} value={form.banque} onChange={(e) => setForm({ ...form, banque: e.target.value })} />
          </Field>
          <Field label={t("bank.acc.holder")}>
            <Input required minLength={2} maxLength={120} value={form.titulaire} onChange={(e) => setForm({ ...form, titulaire: e.target.value })} />
          </Field>
          <Field label={t("bank.acc.number")}>
            <Input required minLength={4} maxLength={80} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          </Field>
          <Field label={t("bank.acc.instructions")}>
            <Input maxLength={400} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </Field>
          <p className="-mt-1 text-xs text-ink-muted">{t("bank.acc.instructionsHint")}</p>
          <Button type="submit" disabled={busy}>
            {busy ? t("bank.acc.saving") : t("bank.acc.add")}
          </Button>
        </form>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <SuccessMessage>{notice}</SuccessMessage>
    </Card>
  );
}
