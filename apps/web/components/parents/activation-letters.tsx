"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { MessageCircle, Printer, X } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Badge, Button } from "@/components/ui";
import { activationUrl, whatsappLink, type ActivationLetter, type BulkCodesResult } from "@/lib/parent-activation";

export interface LetterSchool {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  logoUrl: string | null;
}

function frDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** QR code vers l'activation, téléphone et code préremplis (dans le fragment, jamais envoyé à un serveur). */
function LetterQr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then((d) => alive && setSrc(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client
  return src ? <img src={src} alt="" className="h-28 w-28" /> : <div className="h-28 w-28" />;
}

/** Une lettre A4, bilingue français et anglais. */
function Letter({ letter, school, origin }: { letter: ActivationLetter; school: LetterSchool; origin: string }) {
  const date = frDate(letter.expireLe);
  const plain = activationUrl(origin);
  const children = letter.enfants.map((e) => `${e.prenom} ${e.nom}${e.classe ? ` (${e.classe})` : ""}`).join(", ");
  return (
    <article className="letter mx-auto mb-6 w-[210mm] max-w-full bg-white p-[14mm] text-[11pt] leading-relaxed text-black shadow-sm print:mb-0 print:w-auto print:max-w-none print:p-0 print:shadow-none">
      <header className="flex items-center gap-4 border-b-2 border-black pb-3">
        {school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API
          <img src={`${API_URL}${school.logoUrl}`} alt="" className="h-16 w-auto object-contain" />
        )}
        <div>
          <p className="text-lg font-bold">{school.nom}</p>
          {school.adresse && <p className="text-xs">{school.adresse}</p>}
          {school.telephone && <p className="text-xs">{school.telephone}</p>}
        </div>
      </header>

      <h2 className="mt-5 text-base font-bold">
        Activation de votre compte « Espace Parents »
        <span className="block text-sm font-normal italic">Activate your &quot;Parents Portal&quot; account</span>
      </h2>

      <p className="mt-3">
        À l&apos;attention de <strong>{letter.prenom} {letter.nom}</strong>
        <span className="block text-sm italic">
          To <strong>{letter.prenom} {letter.nom}</strong>
        </span>
      </p>
      {children && (
        <p className="mt-2 text-sm">
          Enfant(s) / Child(ren) : <strong>{children}</strong>
        </p>
      )}

      <div className="my-5 rounded-lg border-2 border-black px-4 py-3 text-center">
        <p className="text-xs uppercase tracking-wide">Votre code d&apos;activation / Your activation code</p>
        <p className="my-1 font-mono text-3xl font-bold tracking-[0.25em]">{letter.code}</p>
        <p className="text-xs">
          Valable jusqu&apos;au {date}, à usage unique / Valid until {date}, single use
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="mb-1 font-bold">Comment faire</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Scannez le QR code, ou ouvrez {plain}</li>
            <li>Votre numéro de téléphone ({letter.telephone}) et votre code sont déjà remplis ; sinon saisissez-les.</li>
            <li>Choisissez un mot de passe (8 caractères au moins), lisez et acceptez la politique de confidentialité.</li>
            <li>Vous suivez alors l&apos;emploi du temps, les absences, les devoirs, les bulletins et les paiements de vos enfants.</li>
          </ol>
        </div>
        <div className="italic">
          <p className="mb-1 font-bold not-italic">How to</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Scan the QR code, or open {plain}</li>
            <li>Your phone number ({letter.telephone}) and your code are already filled in; if not, enter them.</li>
            <li>Choose a password (at least 8 characters), read and accept the privacy policy.</li>
            <li>You can then follow your children&apos;s timetable, absences, homework, report cards and payments.</li>
          </ol>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <LetterQr url={activationUrl(origin, letter.telephone, letter.code)} />
        <p className="max-w-[110mm] text-xs">
          Ce code est personnel : ne le partagez pas. En cas de difficulté, contactez le secrétariat{school.telephone ? ` au ${school.telephone}` : ""}.
          <span className="mt-1 block italic">
            This code is personal: do not share it. If you need help, contact the school office{school.telephone ? ` on ${school.telephone}` : ""}.
          </span>
        </p>
      </div>
    </article>
  );
}

// À l'impression, seule la zone des lettres reste : tout le reste de la page est masqué, et chaque lettre tient sur sa page.
const PRINT_CSS = `
@media print {
  body > *:not(#activation-letters-root) { display: none !important; }
  #activation-letters-root { position: static !important; overflow: visible !important; height: auto !important; background: #fff !important; }
  #activation-letters-root .letter { break-after: page; page-break-after: always; }
  @page { size: A4; margin: 15mm; }
}
`;

/**
 * Résultat d'une génération en lot : les lettres à imprimer et un message WhatsApp par famille. Les codes ne sont
 * affichés qu'ici, une seule fois (seule leur empreinte est conservée) : fermer cette fenêtre les fait disparaître.
 */
export function ActivationLetters({ result, school, onClose }: { result: BulkCodesResult; school: LetterSchool; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { generes, ignores } = result;

  function close() {
    if (window.confirm("Les codes ne pourront plus être affichés après la fermeture. Avez-vous imprimé les lettres ou envoyé les messages ?")) onClose();
  }

  if (!mounted) return null;
  return createPortal(
    <div id="activation-letters-root" className="fixed inset-0 z-50 overflow-auto bg-surface-muted">
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3 print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              {generes.length} lettre{generes.length > 1 ? "s" : ""} d&apos;activation
            </p>
            <p className="text-xs text-ink-muted">Codes valables jusqu&apos;au {frDate(result.expireLe)} ({result.validiteJours} jours).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.print()} disabled={generes.length === 0}>
              <Printer size={16} /> Imprimer ou enregistrer en PDF
            </Button>
            <Button variant="secondary" onClick={close}>
              <X size={16} /> Fermer
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-4 space-y-2 print:hidden">
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            Ces codes ne seront plus affichables après la fermeture de cette fenêtre : imprimez les lettres (ou enregistrez-les en PDF) et envoyez les messages
            maintenant. Si vous les perdez, il faudra en générer de nouveaux, ce qui annule les anciens.
          </p>
          {(ignores.avecCompte > 0 || ignores.codeEnAttente > 0 || ignores.sansAcces > 0) && (
            <p className="text-xs text-ink-muted">
              Non concernées :
              {ignores.avecCompte > 0 && ` ${ignores.avecCompte} famille(s) ont déjà un compte ;`}
              {ignores.codeEnAttente > 0 && ` ${ignores.codeEnAttente} ont déjà un code en attente (leur lettre reste valable) ;`}
              {ignores.sansAcces > 0 && ` ${ignores.sansAcces} n'ont plus accès au portail.`}
            </p>
          )}
        </div>

        {generes.length === 0 ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-ink-muted print:hidden">Aucune famille à qui générer un code.</p>
        ) : (
          <>
            <section className="mb-6 rounded-2xl border border-border bg-surface p-4 print:hidden">
              <h3 className="mb-1 flex items-center gap-2 font-display text-base font-semibold text-ink">
                <MessageCircle size={16} /> Envoyer par WhatsApp
              </h3>
              <p className="mb-3 text-xs text-ink-muted">
                Un lien par famille ouvre WhatsApp avec le message déjà écrit : vous choisissez d&apos;envoyer. Rien n&apos;est envoyé automatiquement.
              </p>
              <ul className="divide-y divide-border">
                {generes.map((l) => {
                  const href = whatsappLink(school.nom, l, origin);
                  return (
                    <li key={l.guardianId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="text-ink">
                        {l.prenom} {l.nom} <span className="text-ink-muted">· {l.telephone}</span>
                      </span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sa-interactive inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-xs font-medium text-white"
                        >
                          <MessageCircle size={14} /> Ouvrir WhatsApp
                        </a>
                      ) : (
                        <Badge color="orange">Numéro inutilisable pour WhatsApp</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <h3 className="mb-2 font-display text-base font-semibold text-ink print:hidden">Lettres à imprimer</h3>
            {generes.map((l) => (
              <Letter key={l.guardianId} letter={l} school={school} origin={origin} />
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
