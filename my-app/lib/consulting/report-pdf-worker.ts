import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ConsultationReportViewModelV1 } from "@hairfit/shared/consulting/report";
import type { ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";

async function getReportPdfWorkerBinding() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & {
      REPORT_PDF_WORKER?: Fetcher;
    }).REPORT_PDF_WORKER ?? null;
  } catch (error) {
    console.warn("[report-pdf] Cloudflare context is unavailable", error);
    return null;
  }
}

export async function renderConsultationReportPdfWithWorker(
  report: ConsultationReportViewModelV1 | ConsultationReportViewModelV2,
) {
  const worker = await getReportPdfWorkerBinding();
  if (!worker) throw new Error("REPORT_PDF_WORKER_UNAVAILABLE");

  const response = await worker.fetch(new Request("https://report-pdf.internal/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  }));
  if (!response.ok) {
    const code = response.headers.get("x-hairfit-error-code")?.trim();
    throw new Error(code || "REPORT_PDF_RENDER_FAILED");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("INVALID_PDF_OUTPUT");
  }
  return bytes;
}
