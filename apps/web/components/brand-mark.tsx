/**
 * Petit emblème de l'école (cercle, livre, étoile) : remplace l'ancienne pastille « S ». C'est la même image que l'icône de
 * l'application installée (`/icons/icon-192.png`, emblème sur fond blanc) : toujours disponible, même sans Internet et avant
 * que le logo de l'école ait chargé, et jamais un logo différent d'un écran à l'autre.
 */
export function BrandMark({ className = "h-9 w-9 rounded-xl" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- petite image statique du site
    <img src="/icons/icon-192.png" alt="" aria-hidden width={192} height={192} className={`shrink-0 bg-white object-contain ${className}`} />
  );
}
