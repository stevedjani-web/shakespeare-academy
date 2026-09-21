"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import type { PointageCodeRow } from "@/lib/types";
import { Button, Card, EmptyState, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import { describeError, TAB_HINT } from "@/components/vie-scolaire/shared";

interface Settings {
  pointageFenetreMinutes: number;
  pointageToleranceMinutes: number;
  pointageEcartMinMinutes: number;
}

const qrUrl = (token: string) => `${window.location.origin}/pointage?c=${token}`;

/** QR codes de pointage (une salle, l'entrée de l'école) à imprimer, et règles de pointage. */
export function PointageCodesTab() {
  const [codes, setCodes] = useState<PointageCodeRow[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ fenetre: "", tolerance: "", ecart: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([api.get<PointageCodeRow[]>("/pointage-codes"), api.get<Settings>("/pedagogy/settings")]);
    setCodes(list);
    setSettings(s);
    setForm({
      fenetre: String(s.pointageFenetreMinutes),
      tolerance: String(s.pointageToleranceMinutes),
      ecart: String(s.pointageEcartMinMinutes),
    });
    const next: Record<string, string> = {};
    for (const c of list) if (c.token) next[c.token] = await QRCode.toDataURL(qrUrl(c.token), { margin: 1, width: 360 });
    setImages(next);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(describeError(e)));
  }, [load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function downloadPdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const ready = codes.filter((c) => c.token && images[c.token]);
    ready.forEach((c, i) => {
      if (i > 0) doc.addPage();
      doc.setFontSize(28);
      doc.text(c.nom, 105, 40, { align: "center" });
      doc.setFontSize(13);
      doc.text(
        c.type === "ENTREE" ? "Scannez ce code à votre arrivée et à votre départ." : "Scannez ce code au début et à la fin de votre cours.",
        105,
        52,
        { align: "center" },
      );
      doc.addImage(images[c.token!], "PNG", 40, 65, 130, 130);
      doc.setFontSize(11);
      doc.text("Code à saisir si la caméra est indisponible :", 105, 210, { align: "center" });
      doc.setFontSize(14);
      doc.text(c.token!, 105, 220, { align: "center" });
    });
    doc.save("qr-codes-pointage.pdf");
  }

  const missing = codes.filter((c) => !c.token).length;
  const dirty =
    settings &&
    (Number(form.fenetre) !== settings.pointageFenetreMinutes ||
      Number(form.tolerance) !== settings.pointageToleranceMinutes ||
      Number(form.ecart) !== settings.pointageEcartMinMinutes);

  return (
    <div className="space-y-4">
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">QR codes à imprimer</h2>
        <p className={`mb-3 ${TAB_HINT}`}>
          Un QR par salle (enseignants qui pointent à chaque cours) et un pour l&apos;entrée de l&apos;école (arrivée et départ). Affichez-les dans la salle ou à
          l&apos;entrée. Si un QR est photographié ou abîmé, régénérez-le : l&apos;ancien cesse de fonctionner immédiatement.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {missing > 0 && <Button onClick={() => void run(() => api.post("/pointage-codes/generate", {}), "QR codes générés.")}>Générer les QR manquants ({missing})</Button>}
          {codes.some((c) => c.token) && (
            <Button variant="secondary" onClick={() => void downloadPdf()}>
              <Download size={16} /> Télécharger tous les QR (PDF)
            </Button>
          )}
        </div>
        {codes.length <= 1 && !codes.some((c) => c.token) && (
          <EmptyState icon={<QrCode />} title="Aucun QR code." description="Générez-les : un pour l'entrée et un par salle active." />
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {codes.map((c) => (
            <li key={c.roomId ?? "entree"} className="rounded-2xl border border-border p-3">
              <p className="font-medium text-ink">{c.nom}</p>
              {c.token ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images[c.token]} alt={`QR de pointage : ${c.nom}`} className="mx-auto my-2 h-44 w-44" />
                  <p className="break-all text-center font-mono text-xs text-ink-muted">{c.token}</p>
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onClick={() => {
                      if (confirm(`Régénérer le QR « ${c.nom} » ? L'ancien QR affiché ne fonctionnera plus.`)) {
                        void run(() => api.post("/pointage-codes/rotate", { roomId: c.roomId ?? undefined }), "QR régénéré : imprimez le nouveau.");
                      }
                    }}
                  >
                    Régénérer
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Pas encore généré.</p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">Règles de pointage</h2>
        <p className={`mb-3 ${TAB_HINT}`}>Valeurs de départ provisoires, à confirmer ou à changer par la Direction.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Le début d'un cours peut être pointé jusqu'à (minutes avant l'heure)">
            <Input type="number" min={0} max={120} value={form.fenetre} onChange={(e) => setForm({ ...form, fenetre: e.target.value })} />
          </Field>
          <Field label="Retard signalé au-delà de (minutes)">
            <Input type="number" min={0} max={120} value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
          </Field>
          <Field label="Délai minimal entre deux scans (minutes)">
            <Input type="number" min={1} max={60} value={form.ecart} onChange={(e) => setForm({ ...form, ecart: e.target.value })} />
          </Field>
        </div>
        <Button
          className="mt-3"
          disabled={!dirty || form.fenetre === "" || form.tolerance === "" || Number(form.ecart) < 1}
          onClick={() =>
            void run(
              () =>
                api.patch("/pedagogy/settings", {
                  pointageFenetreMinutes: Number(form.fenetre),
                  pointageToleranceMinutes: Number(form.tolerance),
                  pointageEcartMinMinutes: Number(form.ecart),
                }),
              "Règles enregistrées.",
            )
          }
        >
          Enregistrer les règles
        </Button>
      </Card>
    </div>
  );
}
