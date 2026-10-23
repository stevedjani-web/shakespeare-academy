// Grilles horaires : quelle liste de créneaux s'applique à une classe, et lesquels afficher pour une vue
// par enseignant ou par salle (fonctions pures, même règle que le serveur : `apps/api/src/pedagogy/time-grid.util.ts`).

export interface GridSlot {
  id: string;
  sectionId: string | null;
  gridId: string | null;
}

/**
 * Créneaux d'une classe : la grille nommée de son niveau si elle existe, sinon la grille propre à sa section
 * (si elle a des créneaux), sinon la grille commune.
 */
export function slotsForLevel<T extends GridSlot>(
  slots: T[],
  level: { gridId?: string | null } | undefined,
  sectionId: string | undefined,
): T[] {
  if (level?.gridId) return slots.filter((s) => s.gridId === level.gridId);
  const own = sectionId
    ? slots.filter((s) => s.sectionId === sectionId && s.gridId === null)
    : [];
  return own.length > 0
    ? own
    : slots.filter((s) => s.sectionId === null && s.gridId === null);
}

/** Clé d'une grille : commune, d'une section ou nommée. */
export function gridKey(s: Pick<GridSlot, "sectionId" | "gridId">): string {
  return s.gridId
    ? `g:${s.gridId}`
    : s.sectionId
      ? `s:${s.sectionId}`
      : "common";
}

/**
 * Créneaux à montrer dans une vue qui mélange plusieurs classes (enseignant, salle) : ceux des grilles dont au
 * moins une séance affichée se sert. Sans séance, tous les créneaux.
 */
export function slotsOfUsedGrids<T extends GridSlot>(
  slots: T[],
  entries: Array<{ timeSlotId: string }>,
): T[] {
  if (entries.length === 0) return slots;
  const byId = new Map(slots.map((s) => [s.id, s]));
  const keys = new Set<string>();
  for (const e of entries) {
    const slot = byId.get(e.timeSlotId);
    if (slot) keys.add(gridKey(slot));
  }
  if (keys.size === 0) return slots;
  return slots.filter((s) => keys.has(gridKey(s)));
}
