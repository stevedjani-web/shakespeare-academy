// Contrôle des règles d'annonce des plafonds de validation des sorties (aucun navigateur, aucun serveur).
import { approvalBlock, parseLimitInput, limitToInput } from "../lib/expense-limits.ts";

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
}

const limited = { mois: "2026-10", seuilOperation: 100000, plafondMensuel: 500000, utiliseMois: 420000, resteMois: 80000, illimite: false };
eq("100 000 passe quand il reste assez", approvalBlock(80000, limited), null);
eq("au-dessus du seuil par opération", approvalBlock(100001, limited), "OPERATION");
eq("sous le seuil mais au-dessus du reste du mois", approvalBlock(80001, limited), "MENSUEL");
eq("exactement le reste du mois passe", approvalBlock(80000, limited), null);
eq("le seuil par opération prime sur le plafond du mois", approvalBlock(900000, limited), "OPERATION");
eq("le Promoteur n'est jamais bloqué", approvalBlock(9000000, { ...limited, illimite: true }), null);
eq("sans plafonds = pas de blocage", approvalBlock(9000000, { ...limited, seuilOperation: null, plafondMensuel: null, resteMois: null }), null);
eq("plafonds inconnus (pas encore chargés) = pas d'annonce", approvalBlock(9000000, null), null);

eq("saisie vide = pas de limite", parseLimitInput(""), null);
eq("saisie « 100000 »", parseLimitInput("100000"), 100000);
eq("saisie « 100 000 » (espaces)", parseLimitInput("100 000"), 100000);
eq("saisie « 0 » refusée", parseLimitInput("0"), "invalid");
eq("saisie « 1,5 » refusée", parseLimitInput("1,5"), "invalid");
eq("saisie « -5 » refusée", parseLimitInput("-5"), "invalid");
eq("saisie « abc » refusée", parseLimitInput("abc"), "invalid");
eq("saisie au-dessus d'un milliard refusée", parseLimitInput("1000000001"), "invalid");
eq("affichage d'une valeur", limitToInput(100000), "100000");
eq("affichage de « pas de limite »", limitToInput(null), "");

if (failures > 0) {
  console.error(`${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Tous les contrôles passent.");
