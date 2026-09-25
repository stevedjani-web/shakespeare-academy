/** Remplace {nom} par la valeur donnée ; un paramètre absent laisse {nom} visible (un oubli se voit, il ne se cache pas). */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
