import { Inject, Injectable } from '@nestjs/common';
import { createHash, createVerify } from 'crypto';
import { httpbis } from 'http-message-signatures';
import type { Request as SignatureRequest } from 'http-message-signatures';
import {
  PAWAPAY_PUBLIC_KEY_PROVIDER,
  type PawaPayPublicKeyProvider,
} from './pawapay-public-key-provider.interface';

// Vérifie un retour PawaPay signé (RFC 9421) : jamais de traitement avant d'avoir prouvé la provenance.
// Deux contrôles distincts, comme dans l'exemple officiel PawaPay :
//   1) le Content-Digest recalculé sur le CORPS BRUT doit correspondre à l'en-tête reçu (une signature
//      valide ne prouve que l'intégrité de la valeur d'en-tête, pas qu'elle corresponde au vrai corps) ;
//   2) la signature elle-même (ecdsa-p256-sha256, encodage DER de Node, pas l'IEEE-P1363 de la RFC).
@Injectable()
export class PawaPaySignatureVerifier {
  constructor(
    @Inject(PAWAPAY_PUBLIC_KEY_PROVIDER)
    private readonly publicKeys: PawaPayPublicKeyProvider,
  ) {}

  async verify(request: {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
    rawBody: Buffer;
  }): Promise<boolean> {
    if (!this.verifyDigest(request.headers, request.rawBody)) return false;

    const signatureRequest: SignatureRequest = {
      method: request.method,
      url: request.url,
      headers: request.headers,
    };
    try {
      const result = await httpbis.verifyMessage(
        {
          keyLookup: async (params) => {
            const keyId = params.keyid;
            if (!keyId) return null;
            const publicKey = await this.publicKeys.getPublicKey(keyId);
            if (!publicKey) return null;
            return {
              id: keyId,
              algs: ['ecdsa-p256-sha256'],
              verify: (data: Buffer, signature: Buffer) =>
                Promise.resolve(
                  createVerify('SHA256')
                    .update(data)
                    .verify(publicKey, signature),
                ),
            };
          },
        },
        signatureRequest,
      );
      return result === true;
    } catch {
      return false;
    }
  }

  private verifyDigest(
    headers: Record<string, string | string[]>,
    rawBody: Buffer,
  ): boolean {
    if (!headers['content-digest']) return false;
    let extracted: string[];
    try {
      extracted = httpbis.extractHeader(
        'content-digest',
        new Map([['key', 'sha-512']]),
        {
          method: '',
          url: '',
          headers,
        },
      );
    } catch {
      return false;
    }
    if (extracted.length === 0) return false;
    const received = extracted[0].replaceAll(':', '');
    const actual = createHash('sha512').update(rawBody).digest('base64');
    return received === actual;
  }
}
