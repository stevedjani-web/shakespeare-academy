import { Controller, Logger, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { OnlinePaymentsService } from './online-payments.service';
import { PawaPaySignatureVerifier } from './pawapay-signature.verifier';
import { failureMessage } from './pawapay-failures.util';

interface DepositCallback {
  depositId?: string;
  status?: string;
  failureReason?: { failureCode?: string };
}

/**
 * Retours de PawaPay. Volontairement sans jeton du personnel ni du parent : c'est PawaPay qui appelle, la
 * preuve de provenance est la signature RFC 9421 (jamais un état modifié avant de l'avoir vérifiée). Seule la
 * route « deposit » agit ; « payout » et « refund » sont vérifiées et journalisées (aucun flux ne les
 * déclenche aujourd'hui), pour que PawaPay ait toujours une cible valide.
 */
@Public()
@Controller('webhooks/payment/pawapay')
export class PawaPayWebhookController {
  private readonly logger = new Logger(PawaPayWebhookController.name);

  constructor(
    private readonly verifier: PawaPaySignatureVerifier,
    private readonly onlinePayments: OnlinePaymentsService,
  ) {}

  @Post('deposit')
  async deposit(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    if (!(await this.verifySignature(req))) {
      res.status(403).send('Signature invalide.');
      return;
    }
    const payload = req.body as DepositCallback;
    if (!payload?.depositId) {
      res.status(200).send('OK');
      return;
    }
    // Un état intermédiaire (ACCEPTED, PROCESSING...) n'est pas une conclusion : on attend le retour final.
    if (payload.status === 'COMPLETED' || payload.status === 'FAILED') {
      const result =
        payload.status === 'COMPLETED'
          ? ({ statut: 'COMPLETED' } as const)
          : ({
              statut: 'FAILED',
              motif: failureMessage(payload.failureReason?.failureCode),
            } as const);
      const state = await this.onlinePayments.applyResult(
        payload.depositId,
        result,
      );
      // Identifiant inconnu : 200 quand même, un refus ferait réessayer PawaPay indéfiniment.
      if (state === null)
        this.logger.warn(
          `Retour PawaPay pour un dépôt inconnu : ${payload.depositId}`,
        );
      else if (payload.status === 'FAILED') {
        this.logger.log(
          `Dépôt ${payload.depositId} échoué : ${payload.failureReason?.failureCode ?? 'sans code'}`,
        );
      }
    }
    res.status(200).send('OK');
  }

  @Post('payout')
  async payout(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    await this.acknowledge(req, res, 'payout');
  }

  @Post('refund')
  async refund(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    await this.acknowledge(req, res, 'refund');
  }

  private async acknowledge(
    req: RawBodyRequest<Request>,
    res: Response,
    kind: string,
  ): Promise<void> {
    if (!(await this.verifySignature(req))) {
      res.status(403).send('Signature invalide.');
      return;
    }
    this.logger.log(
      `Retour PawaPay « ${kind} » reçu (non traité : aucun flux ne le déclenche).`,
    );
    res.status(200).send('OK');
  }

  private async verifySignature(
    req: RawBodyRequest<Request>,
  ): Promise<boolean> {
    if (!req.rawBody) return false;
    // Derrière le reverse proxy, le schéma réel de la requête est dans X-Forwarded-Proto.
    const forwarded = req.headers['x-forwarded-proto'];
    const protocol =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0] ??
      req.protocol;
    return this.verifier.verify({
      method: req.method,
      url: `${protocol}://${req.get('host')}${req.originalUrl}`,
      headers: req.headers as Record<string, string | string[]>,
      rawBody: req.rawBody,
    });
  }
}
