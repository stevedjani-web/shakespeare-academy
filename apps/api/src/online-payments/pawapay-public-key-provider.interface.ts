import type { KeyObject } from 'crypto';

// Clé publique PawaPay correspondant à un keyid (voir Signature-Input du retour). Derrière une interface
// pour que les tests injectent une clé locale au lieu d'appeler la vraie API.
export interface PawaPayPublicKeyProvider {
  getPublicKey(keyId: string): Promise<KeyObject | null>;
}

export const PAWAPAY_PUBLIC_KEY_PROVIDER = Symbol(
  'PAWAPAY_PUBLIC_KEY_PROVIDER',
);
