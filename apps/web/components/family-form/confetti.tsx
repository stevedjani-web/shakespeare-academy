"use client";

const COLORS = ["#c99a2e", "#2f2b78", "#157a4a", "#2563a8", "#b8302f", "#e07a1f", "#7c3aed"];

/**
 * Pluie de confettis à l'envoi réussi : de petits rectangles colorés qui partent du centre en éventail (CSS pur, une
 * seule fois). Coupés pour qui a demandé moins de mouvement. Positions déterministes : même rendu à chaque affichage.
 */
export function Confetti({ count = 40 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 110 + ((i * 37) % 170);
        return (
          <span
            key={i}
            className="sa-confetti absolute rounded-[2px]"
            style={
              {
                left: "50%",
                top: 80,
                width: 6 + (i % 3) * 3,
                height: 10 + (i % 4) * 3,
                backgroundColor: COLORS[i % COLORS.length],
                animationDelay: `${(i % 7) * 45}ms`,
                "--dx": `${Math.cos(angle) * radius}px`,
                "--dy": `${Math.sin(angle) * radius * 0.75 + (i % 5) * 18}px`,
                "--rot": `${((i * 53) % 720) - 360}deg`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
