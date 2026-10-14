import type { MessageKey } from "@/lib/i18n";
import type { PaymentMode } from "@/lib/types";

/** Libellé de chaque mode de paiement (guichet : espèces, Mobile Money ; banque : virement, dépôt, chèque). */
export const PAYMENT_MODE_KEY: Record<PaymentMode, MessageKey> = {
  ESPECES: "fin.mode.ESPECES",
  MOBILE_MONEY: "fin.mode.MOBILE_MONEY",
  VIREMENT: "fin.mode.VIREMENT",
  DEPOT_BANCAIRE: "fin.mode.DEPOT_BANCAIRE",
  CHEQUE: "fin.mode.CHEQUE",
};

/** Part des paiements arrivée par la banque (virement, dépôt, chèque) : une copie ancienne du serveur n'a pas ces champs. */
export function bankTotal(parMode: { VIREMENT?: number; DEPOT_BANCAIRE?: number; CHEQUE?: number }): number {
  return (parMode.VIREMENT ?? 0) + (parMode.DEPOT_BANCAIRE ?? 0) + (parMode.CHEQUE ?? 0);
}
