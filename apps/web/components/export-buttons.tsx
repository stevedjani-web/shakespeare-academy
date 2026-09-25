"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { exportExcel, exportPdf, type ExportSection } from "@/lib/export";
import type { School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";

let cachedSchoolName: string | null = null;

function useSchoolName(): string | undefined {
  const [name, setName] = useState<string | undefined>(cachedSchoolName ?? undefined);
  useEffect(() => {
    if (cachedSchoolName) return;
    void api
      .get<School>("/school")
      .then((school) => {
        cachedSchoolName = school.nom;
        setName(school.nom);
      })
      .catch(() => {});
  }, []);
  return name;
}

export function ExportButtons({
  fileName,
  title,
  sections,
  subtitle,
  landscape,
  disabled,
}: {
  fileName: string;
  title: string;
  sections: ExportSection[];
  subtitle?: string;
  landscape?: boolean;
  disabled?: boolean;
}) {
  const schoolName = useSchoolName();
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const empty = sections.every((s) => s.rows.length === 0);

  async function run(kind: "pdf" | "excel") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "excel") await exportExcel(fileName, sections, schoolName);
      else await exportPdf(fileName, title, sections, { schoolName, subtitle, landscape });
    } catch {
      setError(translate("common.exportFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => void run("excel")} disabled={disabled || empty || busy !== null}>
        {busy === "excel" ? <Spinner /> : <FileSpreadsheet size={16} className="text-success" />} Excel
      </Button>
      <Button variant="secondary" onClick={() => void run("pdf")} disabled={disabled || empty || busy !== null}>
        {busy === "pdf" ? <Spinner /> : <FileText size={16} className="text-danger" />} PDF
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
