"use client";

import { Download, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button";

interface ExportResponse {
  export?: { id: string; status: "queued" | "rendering" | "ready" | "failed"; downloadAvailable?: boolean };
  error?: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportToolbar({ consultationId, resultVersion }: { consultationId: string; resultVersion: number }) {
  const [state, setState] = useState<"idle" | "creating" | "ready" | "failed">("idle");
  const [message, setMessage] = useState("화면과 PDF는 동일한 상담 결과 명세를 사용합니다.");

  const createPdf = async () => {
    if (state === "creating") return;
    setState("creating");
    setMessage("PDF 명세서를 생성하고 있습니다.");
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/report-exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ profile: "full_journey", expectedResultVersion: resultVersion, viewModelVersion: 2 }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("application/pdf")) {
        downloadBlob(await response.blob(), `HairFit-consultation-${consultationId.slice(0, 8)}.pdf`);
        setState("ready");
        setMessage("PDF 다운로드가 시작됐습니다.");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as ExportResponse;
      if (!response.ok || !data.export) throw new Error(data.error || "PDF를 만들지 못했습니다.");
      const downloadResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/report-exports/${encodeURIComponent(data.export.id)}/download`, { method: "POST" });
      if (!downloadResponse.ok) throw new Error("PDF 다운로드 권한을 준비하지 못했습니다.");
      downloadBlob(await downloadResponse.blob(), `HairFit-consultation-${consultationId.slice(0, 8)}.pdf`);
      setState("ready");
      setMessage("PDF 다운로드가 시작됐습니다.");
    } catch (error) {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "PDF를 만들지 못했습니다.");
    }
  };

  return <div data-report-toolbar="true" className="f-consulting-report__toolbar flex flex-wrap items-center justify-between gap-3 border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
    <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" aria-hidden="true" /><p aria-live="polite">{message}</p></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />인쇄</Button>
      <Button type="button" loading={state === "creating"} onClick={() => void createPdf()}><Download className="mr-2 h-4 w-4" aria-hidden="true" />PDF 다운로드</Button>
    </div>
  </div>;
}
