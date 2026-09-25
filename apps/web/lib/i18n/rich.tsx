import type { ReactNode } from "react";

/** Affiche un texte traduit dont les passages entre **deux étoiles** sont en gras (les balises ne se traduisent pas). */
export function Rich({ text, strongClassName = "text-ink" }: { text: string; strongClassName?: string }): ReactNode {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className={strongClassName}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
