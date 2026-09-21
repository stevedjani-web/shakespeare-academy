// Port du fournisseur de paiement Mobile Money : le reste de l'application ne connaît que cette interface
// (portabilité et tests sans appel réel, comme les autres services externes du projet).
export interface InitiateDepositInput {
  depositId: string;
  // Montant entier en unités de la devise (XAF n'a pas de sous-unité).
  montant: number;
  devise: string;
  // Numéro débité, format international sans le plus.
  telephone: string;
}

export type ProviderDepositStatus = 'COMPLETED' | 'FAILED' | 'PENDING';

// Refus connu du fournisseur, avec une phrase destinée au parent : jamais le détail brut.
export class OnlinePaymentRefusedError extends Error {}

export interface OnlinePaymentProvider {
  isConfigured(): boolean;
  initiate(input: InitiateDepositInput): Promise<void>;
  getStatus(
    depositId: string,
  ): Promise<{ statut: ProviderDepositStatus; motif?: string }>;
}

export const ONLINE_PAYMENT_PROVIDER = Symbol('ONLINE_PAYMENT_PROVIDER');
