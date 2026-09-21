import { Injectable, Logger } from '@nestjs/common';
import {
  OnlinePaymentRefusedError,
  type InitiateDepositInput,
  type OnlinePaymentProvider,
  type ProviderDepositStatus,
} from './online-payment-provider.interface';
import {
  getPawaPayBaseUrl,
  isPawaPayTokenConfigured,
} from './pawapay-config.util';
import { failureMessage, GENERIC_FAILURE } from './pawapay-failures.util';

interface PredictProviderResponse {
  country: string;
  provider: string;
  phoneNumber: string;
}

interface DepositResponse {
  depositId?: string;
  status?: string;
  failureReason?: { failureCode?: string; failureMessage?: string };
}

interface DepositStatusResponse {
  status?: string;
  // v2 : { status: "FOUND", data: { status: "COMPLETED", failureReason } }
  data?: { status?: string; failureReason?: { failureCode?: string } };
}

const UNAVAILABLE =
  'Le service de paiement est momentanément indisponible. Réessayez dans quelques minutes.';

/**
 * Fournisseur PawaPay (agrégateur Mobile Money). initiate() lance un vrai dépôt mais ne conclut JAMAIS sur
 * la réponse immédiate : « ACCEPTED » veut seulement dire « mis en file », c'est le retour signé (ou la
 * revérification) qui dit si le parent a réellement payé. Le détail brut d'une erreur reste dans les
 * journaux (jamais le jeton) ; le parent ne reçoit qu'une phrase.
 */
@Injectable()
export class PawaPayProvider implements OnlinePaymentProvider {
  private readonly logger = new Logger(PawaPayProvider.name);

  isConfigured(): boolean {
    return isPawaPayTokenConfigured();
  }

  private headers() {
    return {
      Authorization: `Bearer ${process.env.PAWAPAY_API_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  async initiate(input: InitiateDepositInput): Promise<void> {
    // L'opérateur (MTN, Airtel...) est déterminé par le fournisseur à partir du numéro, jamais deviné ici.
    const predicted = await this.predictProvider(input.telephone);

    let response: Response;
    try {
      response = await fetch(`${getPawaPayBaseUrl()}/deposits`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          depositId: input.depositId,
          // Montant en unités majeures, en chaîne : « 25000 » pour du XAF (aucune décimale).
          amount: String(input.montant),
          currency: input.devise,
          payer: {
            type: 'MMO',
            accountDetails: {
              phoneNumber: predicted.phoneNumber,
              provider: predicted.provider,
            },
          },
        }),
      });
    } catch (err) {
      this.logger.error(
        `Dépôt PawaPay injoignable : ${(err as Error).message}`,
      );
      throw new OnlinePaymentRefusedError(UNAVAILABLE);
    }

    if (!response.ok) {
      this.logger.error(
        `Dépôt PawaPay refusé (HTTP ${response.status}) : ${(await response.text()).slice(0, 500)}`,
      );
      throw new OnlinePaymentRefusedError(
        response.status >= 500 ? UNAVAILABLE : GENERIC_FAILURE,
      );
    }
    const body = (await response.json()) as DepositResponse;
    if (body.status === 'REJECTED') {
      this.logger.warn(
        `Dépôt PawaPay rejeté : ${body.failureReason?.failureCode ?? 'inconnu'}`,
      );
      throw new OnlinePaymentRefusedError(
        failureMessage(body.failureReason?.failureCode),
      );
    }
  }

  private async predictProvider(
    phoneNumber: string,
  ): Promise<PredictProviderResponse> {
    let response: Response;
    try {
      response = await fetch(`${getPawaPayBaseUrl()}/predict-provider`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ phoneNumber }),
      });
    } catch (err) {
      this.logger.error(
        `Détection de l'opérateur injoignable : ${(err as Error).message}`,
      );
      throw new OnlinePaymentRefusedError(UNAVAILABLE);
    }
    if (!response.ok) {
      this.logger.warn(
        `Détection de l'opérateur refusée (HTTP ${response.status}).`,
      );
      throw new OnlinePaymentRefusedError(
        "Ce numéro n'est pas pris en charge (opérateurs MTN et Airtel). Vérifiez le numéro.",
      );
    }
    return (await response.json()) as PredictProviderResponse;
  }

  async getStatus(
    depositId: string,
  ): Promise<{ statut: ProviderDepositStatus; motif?: string }> {
    const response = await fetch(
      `${getPawaPayBaseUrl()}/deposits/${encodeURIComponent(depositId)}`,
      {
        headers: this.headers(),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Lecture du dépôt PawaPay impossible (HTTP ${response.status}).`,
      );
    }
    const body = (await response.json()) as DepositStatusResponse;
    const status = body.data?.status ?? body.status;
    if (status === 'COMPLETED') return { statut: 'COMPLETED' };
    if (status === 'FAILED') {
      return {
        statut: 'FAILED',
        motif: failureMessage(body.data?.failureReason?.failureCode),
      };
    }
    return { statut: 'PENDING' };
  }
}
