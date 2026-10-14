"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Copy, Landmark } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { formatDate, formatMontant } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import { methodKey, parentStatusKey, type BankClaimStatus, type PortalBankClaim, type PortalBankContext } from "@/lib/bank-payments";
import { BankDeclarationForm } from "@/components/bank-payments/declaration-form";
import { Badge, Card, EmptyState, ErrorMessage, PageTitle, Spinner, SuccessMessage } from "@/components/ui";

const STATUS_COLOR: Record<BankClaimStatus, "orange" | "blue" | "green" | "red" | "slate"> = {
  EN_ATTENTE: "orange",
  CREDIT_CONFIRME: "blue",
  VALIDE: "green",
  REJETE: "red",
  RETIRE: "slate",
};

// Paiement par banque vu par le parent : coordonnées de l'école, déclaration avec preuve, suivi (Lot « paiement par banque »).
export default function ParentBankPaymentsPage() {
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [context, setContext] = useState<PortalBankContext | null>(null);
  const [claims, setClaims] = useState<PortalBankClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  const load = useCallback(async () => {
    try {
      const [ctx, list] = await Promise.all([
        portalApi.get<PortalBankContext>("/portal/bank-payments/context"),
        portalApi.get<PortalBankClaim[]>("/portal/bank-payments"),
      ]);
      setContext(ctx);
      setClaims(list);
      setError(null);
    } catch (err) {
      setError(describePortalError(err));
    }
  }, []);

  useEffect(() => {
    if (parent) void load();
  }, [parent, load]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Le presse-papier peut être refusé : le numéro reste affiché et sélectionnable à la main.
    }
  }

  async function withdraw(id: string) {
    if (!confirm(t("bank.parent.withdrawConfirm"))) return;
    setBusyId(id);
    setError(null);
    try {
      await portalApi.post(`/portal/bank-payments/${id}/withdraw`);
      await load();
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link href="/parents" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline">
          <ArrowLeft size={15} /> {t("bank.parent.back")}
        </Link>
      </div>
      <PageTitle subtitle={t("bank.parent.intro")}>{t("bank.parent.title")}</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && (
        <div className="mb-3">
          <SuccessMessage>{notice}</SuccessMessage>
        </div>
      )}
      {!context && !error && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}

      {context && !context.actif && <EmptyState icon={<Landmark />} title={t("bank.parent.disabled")} />}

      {context?.actif && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Building2 size={18} className="text-primary" /> {t("bank.parent.accounts")}
            </h2>
            <ul className="space-y-3">
              {context.comptes.map((a) => (
                <li key={a.id} className="rounded-xl border border-border bg-surface-muted/50 p-3">
                  <p className="font-medium text-ink">{a.banque}</p>
                  <p className="text-sm text-ink-muted">{t("bank.parent.accountOwner", { name: a.titulaire })}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="select-all break-all rounded bg-surface px-2 py-1 text-sm text-ink">{a.numero}</code>
                    <button
                      type="button"
                      onClick={() => void copy(a.numero, a.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Copy size={13} /> {copied === a.id ? t("bank.parent.copied") : t("bank.parent.copy")}
                    </button>
                  </div>
                  {a.instructions && <p className="mt-1.5 text-sm text-ink">{a.instructions}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">{t("bank.form.title")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("bank.form.intro")}</p>
            <BankDeclarationForm
              accounts={context.comptes}
              students={context.enfants}
              submit={async (body) => {
                try {
                  await portalApi.upload("/portal/bank-payments", body);
                } catch (err) {
                  throw new Error(describePortalError(err));
                }
              }}
              onSent={() => {
                setNotice(t("bank.form.sent"));
                void load();
              }}
            />
          </Card>
        </div>
      )}

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-ink">{t("bank.parent.history")}</h2>
      {claims && claims.length === 0 && <EmptyState icon={<Landmark />} title={t("bank.parent.empty")} />}
      <ul className="space-y-3">
        {claims?.map((c) => (
          <li key={c.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {formatMontant(c.montant)} <span className="text-ink-muted">· {t(methodKey(c.methode))}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {c.banque} · {c.referenceOperation} · {t("bank.parent.operationOn", { date: formatDate(c.dateOperation) })} ·{" "}
                    {t("bank.parent.pieces", { n: c.pieces })}
                  </p>
                </div>
                <Badge color={STATUS_COLOR[c.statut]}>{t(parentStatusKey(c.statut))}</Badge>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {c.lignes.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {l.eleve.prenom} · {l.libelle}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatMontant(l.montantValide ?? l.montantDeclare)}
                      {l.paiement && (
                        <Link href={`/parents/enfant/${l.eleve.id}/recu/${l.paiement.id}`} className="text-xs font-medium text-primary underline">
                          {t("bank.parent.viewReceipt", { number: l.paiement.numeroRecu })}
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {c.statut === "REJETE" && c.motifRejet && (
                <p className="mt-2 text-sm text-danger">
                  {t("bank.parent.rejectedReason", { reason: c.motifRejet })} {t("bank.parent.rejectedHint")}
                </p>
              )}
              {c.excedent > 0 && (
                <p className="mt-2 text-sm text-ink-muted">
                  {c.excedentRegle ? t("bank.parent.surplusDone", { amount: formatMontant(c.excedent) }) : t("bank.parent.surplus", { amount: formatMontant(c.excedent) })}
                </p>
              )}
              {c.statut === "EN_ATTENTE" && (
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void withdraw(c.id)}
                  className="mt-2 text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {t("bank.parent.withdraw")}
                </button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
