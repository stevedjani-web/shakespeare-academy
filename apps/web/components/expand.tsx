"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

/** Ensemble d'identifiants développés, avec les gestes usuels (basculer, tout ouvrir, tout fermer). */
export function useExpanded() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  return {
    open,
    isOpen: (id: string) => open.has(id),
    toggle: (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    openAll: (ids: string[]) => setOpen(new Set(ids)),
    closeAll: () => setOpen(new Set()),
  };
}

/** Bouton + / − qui développe une ligne. */
export function ExpandButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? "Réduire" : "Développer"} ${label}`}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-muted"
    >
      {open ? <Minus size={15} /> : <Plus size={15} />}
    </button>
  );
}

/** « Tout développer » / « Tout réduire » (affichés seulement s'il y a plusieurs lignes). */
export function ExpandAll({ count, onOpenAll, onCloseAll }: { count: number; onOpenAll: () => void; onCloseAll: () => void }) {
  if (count < 2) return null;
  const cls = "rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted";
  return (
    <div className="mb-3 flex gap-2 text-sm">
      <button type="button" onClick={onOpenAll} className={cls}>
        Tout développer
      </button>
      <button type="button" onClick={onCloseAll} className={cls}>
        Tout réduire
      </button>
    </div>
  );
}
