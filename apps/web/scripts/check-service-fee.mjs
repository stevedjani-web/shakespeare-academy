// Contrôle des règles de calcul des frais de service (aucun navigateur, aucun serveur).
import { computeServiceFee, parseRatePercent, bpToInput } from "../lib/service-fee.ts";

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
}

eq("2 % de 100 = 2", computeServiceFee(100, 200), 2);
eq("2 % de 10 000 = 200", computeServiceFee(10000, 200), 200);
eq("2 % de 10 001 arrondi au supérieur = 201", computeServiceFee(10001, 200), 201);
eq("2 % de 1 = 1 (jamais 0 : arrondi supérieur)", computeServiceFee(1, 200), 1);
eq("taux 0 = aucun frais", computeServiceFee(10000, 0), 0);
eq("montant invalide = 0", computeServiceFee(-5, 200), 0);
eq("2,5 % de 10 000 = 250", computeServiceFee(10000, 250), 250);
eq("4,17 % de 100 000 = 4 170", computeServiceFee(100000, 417), 4170);
eq("saisie « 2 »", parseRatePercent("2"), 200);
eq("saisie « 2,5 »", parseRatePercent("2,5"), 250);
eq("saisie « 2.55 »", parseRatePercent("2.55"), 255);
eq("saisie « 10 »", parseRatePercent("10"), 1000);
eq("saisie « 10,01 » refusée (au-dessus de 10)", parseRatePercent("10,01"), null);
eq("saisie « 2,555 » refusée (3 décimales)", parseRatePercent("2,555"), null);
eq("saisie « -1 » refusée", parseRatePercent("-1"), null);
eq("saisie vide refusée", parseRatePercent(""), null);
eq("saisie « abc » refusée", parseRatePercent("abc"), null);
eq("affichage 200 -> « 2 »", bpToInput(200), "2");
eq("affichage 250 -> « 2.5 »", bpToInput(250), "2.5");

if (failures) {
  console.error(`${failures} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Tous les contrôles passent.");
