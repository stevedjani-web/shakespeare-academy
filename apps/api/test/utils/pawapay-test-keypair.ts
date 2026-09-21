// Paire EC P-256 fixe générée une fois pour les tests de signature PawaPay
// (online-payments.e2e-spec.ts) — jamais une vraie clé PawaPay, ne sert qu'à
// signer/vérifier des callbacks simulés en local. Committée comme fixture,
// comme prévu par le plan approuvé.
export const PAWAPAY_TEST_KEY_ID = "HTTP_EC_P256_KEY:test";

export const PAWAPAY_TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYfUyFL/souq/b5n3K6lBDKDFNBr8
4Un4nZ2gdQvEacojjdED61FlkEmnWQR3aZIf2SlmYUf7vQH42JNduNxroQ==
-----END PUBLIC KEY-----`;

export const PAWAPAY_TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg75do+m7xWSzGehvA
LgYEWa+BCFdkkiJe4tr8dDJNteqhRANCAARh9TIUv+yi6r9vmfcrqUEMoMU0Gvzh
SfidnaB1C8RpyiON0QPrUWWQSadZBHdpkh/ZKWZhR/u9AfjYk1243Guh
-----END PRIVATE KEY-----`;
