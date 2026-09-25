"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import type { PointageCodeRow } from "@/lib/types";
import { Button, Card, EmptyState, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { describeError, TAB_HINT } from "@/components/vie-scolaire/shared";

interface Settings {
  pointageFenetreMinutes: number;
  pointageToleranceMinutes: number;
  pointageEcartMinMinutes: number;
}

const qrUrl = (token: string) => `${window.location.origin}/pointage?c=${token}`;

/** QR codes de pointage (une salle, l'entrée de l'école) à imprimer, et règles de pointage. */
export function PointageCodesTab() {
  const { t } = useI18n();
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
      doc.text(c.type === "ENTREE" ? t("tt.qr.pdfEntrance") : t("tt.qr.pdfRoom"), 105, 52, { align: "center" });
      doc.addImage(images[c.token!], "PNG", 40, 65, 130, 130);
      doc.setFontSize(11);
      doc.text(t("tt.qr.pdfFallback"), 105, 210, { align: "center" });
      doc.setFontSize(14);
      doc.text(c.token!, 105, 220, { align: "center" });
    });
    doc.save(t("tt.qr.pdfFile"));
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
        <h2 className="font-display text-lg font-semibold text-ink">{t("tt.qr.title")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>{t("tt.qr.hint")}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {missing > 0 && (
            <Button onClick={() => void run(() => api.post("/pointage-codes/generate", {}), t("tt.qr.generated"))}>
              {t("tt.qr.generateMissing", { count: missing })}
            </Button>
          )}
          {codes.some((c) => c.token) && (
            <Button variant="secondary" onClick={() => void downloadPdf()}>
              <Download size={16} /> {t("tt.qr.downloadAll")}
            </Button>
          )}
        </div>
        {codes.length <= 1 && !codes.some((c) => c.token) && (
          <EmptyState icon={<QrCode />} title={t("tt.qr.emptyTitle")} description={t("tt.qr.emptyDesc")} />
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {codes.map((c) => (
            <li key={c.roomId ?? "entree"} className="rounded-2xl border border-border p-3">
              <p className="font-medium text-ink">{c.nom}</p>
              {c.token ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images[c.token]} alt={t("tt.qr.alt", { name: c.nom })} className="mx-auto my-2 h-44 w-44" />
                  <p className="break-all text-center font-mono text-xs text-ink-muted">{c.token}</p>
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onClick={() => {
                      if (confirm(t("tt.qr.confirmRotate", { name: c.nom }))) {
                        void run(() => api.post("/pointage-codes/rotate", { roomId: c.roomId ?? undefined }), t("tt.qr.rotated"));
                      }
                    }}
                  >
                    {t("tt.qr.rotate")}
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">{t("tt.qr.notGenerated")}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">{t("tt.qr.rulesTitle")}</h2>
        <p className={`mb-3 ${TAB_HINT}`}>{t("tt.qr.rulesHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("tt.qr.windowField")}>
            <Input type="number" min={0} max={120} value={form.fenetre} onChange={(e) => setForm({ ...form, fenetre: e.target.value })} />
          </Field>
          <Field label={t("tt.qr.toleranceField")}>
            <Input type="number" min={0} max={120} value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
          </Field>
          <Field label={t("tt.qr.gapField")}>
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
              t("tt.qr.rulesSaved"),
            )
          }
        >
          {t("tt.qr.saveRules")}
        </Button>
      </Card>
    </div>
  );
}
