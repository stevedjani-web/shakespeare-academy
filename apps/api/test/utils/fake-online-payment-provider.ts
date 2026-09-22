import {
  OnlinePaymentRefusedError,
  type InitiateDepositInput,
  type OnlinePaymentProvider,
  type ProviderDepositStatus,
} from '../../src/online-payments/online-payment-provider.interface';

// Faux fournisseur de paiement : enregistre les dépôts lancés et renvoie l'état qu'un test lui impose.
// Aucun appel réseau réel dans la suite de tests.
export class FakeOnlinePaymentProvider implements OnlinePaymentProvider {
  configured = true;
  initiated: InitiateDepositInput[] = [];
  refuseWith: string | null = null;
  statuses = new Map<
    string,
    { statut: ProviderDepositStatus; motif?: string }
  >();
  failStatusLookup = false;
  statusCalls: string[] = [];

  reset() {
    this.configured = true;
    this.initiated = [];
    this.refuseWith = null;
    this.statuses.clear();
    this.failStatusLookup = false;
    this.statusCalls = [];
  }

  isConfigured() {
    return this.configured;
  }

  initiate(input: InitiateDepositInput): Promise<void> {
    if (this.refuseWith) throw new OnlinePaymentRefusedError(this.refuseWith);
    this.initiated.push(input);
    return Promise.resolve();
  }

  getStatus(depositId: string) {
    this.statusCalls.push(depositId);
    if (this.failStatusLookup) throw new Error('fournisseur injoignable');
    return Promise.resolve(
      this.statuses.get(depositId) ?? { statut: 'PENDING' as const },
    );
  }
}
