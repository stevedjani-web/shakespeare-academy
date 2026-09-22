import { createPublicKey, type KeyObject } from 'crypto';
import type { PawaPayPublicKeyProvider } from '../../src/online-payments/pawapay-public-key-provider.interface';
import {
  PAWAPAY_TEST_KEY_ID,
  PAWAPAY_TEST_PUBLIC_KEY_PEM,
} from './pawapay-test-keypair';

// Renvoie la clé publique de test locale au lieu d'appeler la vraie API PawaPay : aucun appel réseau en CI.
export class FakePawaPayPublicKeyProvider implements PawaPayPublicKeyProvider {
  private readonly publicKey: KeyObject = createPublicKey(
    PAWAPAY_TEST_PUBLIC_KEY_PEM,
  );

  getPublicKey(keyId: string): Promise<KeyObject | null> {
    return Promise.resolve(
      keyId === PAWAPAY_TEST_KEY_ID ? this.publicKey : null,
    );
  }
}
