const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Convertit une durée courte ("15m", "7d", "30s") en millisecondes. */
export default function ms(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(
      `Format de durée invalide : "${duration}" (attendu ex. "15m", "7d").`,
    );
  }
  const [, value, unit] = match;
  return Number(value) * UNITS[unit];
}
