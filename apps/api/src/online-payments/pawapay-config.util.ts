// Source de vérité unique de l'URL de base PawaPay (API v2) : utilisée par le fournisseur (dépôts) et par
// le fournisseur de clés publiques (vérification de signature), pour qu'ils ne pointent jamais l'un sur le
// bac à sable et l'autre sur la production. Le suffixe /v2 est requis par /deposits et /predict-provider.
export function getPawaPayBaseUrl(): string {
  const production = process.env.PAWAPAY_ENVIRONMENT === 'production';
  const host = production
    ? 'https://api.pawapay.io'
    : 'https://api.sandbox.pawapay.io';
  return `${host}/v2`;
}

export function isPawaPayTokenConfigured(): boolean {
  return Boolean(process.env.PAWAPAY_API_TOKEN);
}
