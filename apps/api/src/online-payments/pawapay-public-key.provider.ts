import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, type KeyObject } from 'crypto';
import { getPawaPayBaseUrl } from './pawapay-config.util';
import type { PawaPayPublicKeyProvider } from './pawapay-public-key-provider.interface';

interface PawaPayPublicKeyEntry {
  id: string;
  key: string;
}

// Un seul GET /public-key/http au premier keyid inconnu, jamais un appel par retour reçu. L'ensemble des
// clés est rechargé à chaque absence, pour absorber une rotation de clé côté PawaPay sans durée arbitraire.
@Injectable()
export class RealPawaPayPublicKeyProvider implements PawaPayPublicKeyProvider {
  private readonly logger = new Logger(RealPawaPayPublicKeyProvider.name);
  private cache = new Map<string, KeyObject>();

  async getPublicKey(keyId: string): Promise<KeyObject | null> {
    const cached = this.cache.get(keyId);
    if (cached) return cached;
    await this.refetch();
    return this.cache.get(keyId) ?? null;
  }

  private async refetch(): Promise<void> {
    try {
      const response = await fetch(`${getPawaPayBaseUrl()}/public-key/http`, {
        headers: { Authorization: `Bearer ${process.env.PAWAPAY_API_TOKEN}` },
      });
      if (!response.ok) {
        this.logger.warn(
          `Lecture des clés publiques PawaPay refusée (HTTP ${response.status}).`,
        );
        return;
      }
      const entries = (await response.json()) as PawaPayPublicKeyEntry[];
      const fresh = new Map<string, KeyObject>();
      for (const entry of entries)
        fresh.set(entry.id, createPublicKey(entry.key));
      this.cache = fresh;
    } catch (err) {
      this.logger.warn(
        `Lecture des clés publiques PawaPay impossible : ${(err as Error).message}`,
      );
    }
  }
}
