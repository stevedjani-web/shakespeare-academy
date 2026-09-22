/**
 * Mention légale de l'éditeur du logiciel (INFRAONE SYSTEMS), distincte du nom de l'établissement
 * (Shakespeare Academy, déjà affiché ailleurs) — un seul composant partagé pour ne jamais la faire
 * diverger d'un écran à l'autre. Année calculée (jamais figée en dur), comme le faisait déjà la mention
 * "© {année} Shakespeare Academy" du panneau de marque de la page de connexion.
 */
export function CopyrightFooter({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] text-ink-muted ${className}`}>
      © INFRAONE SYSTEMS {new Date().getFullYear()}. Tous droits réservés.
    </p>
  );
}
