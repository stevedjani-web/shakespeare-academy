// Plafonds de validation des sorties. Même règle que le serveur (src/expenses/expense-limits.util.ts), qui reste seul
// juge : ici on ne fait qu'ANNONCER à l'approbateur ce qui sera refusé, et pourquoi.

export interface ExpenseApprovalLimits {
  mois: string;
  seuilOperation: number | null;
  plafondMensuel: number | null;
  utiliseMois: number;
  resteMois: number | null;
  illimite: boolean;
}

export type ApprovalBlock = "OPERATION" | "MENSUEL" | null;

/** Pourquoi cet approbateur ne pourra pas valider ce montant (null = il peut). Le Promoteur (illimité) n'est jamais bloqué. */
export function approvalBlock(montant: number, limits: ExpenseApprovalLimits | null): ApprovalBlock {
  if (!limits || limits.illimite) return null;
  if (limits.seuilOperation !== null && montant > limits.seuilOperation) return "OPERATION";
  if (limits.resteMois !== null && montant > limits.resteMois) return "MENSUEL";
  return null;
}

/** Saisie d'un plafond : vide = pas de limite (null), sinon un entier positif (espaces tolérés) ; « invalid » sinon. */
export function parseLimitInput(input: string): number | null | "invalid" {
  const text = input.replace(/[\s  ]/g, "");
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return "invalid";
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000_000) return "invalid";
  return n;
}

export function limitToInput(value: number | null): string {
  return value === null ? "" : String(value);
}
