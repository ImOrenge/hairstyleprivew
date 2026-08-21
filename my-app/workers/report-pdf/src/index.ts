import type { ConsultationReportViewModelV1 } from "@hairfit/shared/consulting/report";
import type { ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";
import { configureReportPdfFontSource } from "../../../lib/consulting/report-pdf-font";
import { renderConsultationReportPdf } from "../../../lib/consulting/render-report-pdf";
import { renderConsultationReportPdfV2 } from "../../../lib/consulting/render-report-pdf-v2";

const MAX_REPORT_BODY_BYTES = 2 * 1024 * 1024;
const FONT_ASSET_URL = "https://report-pdf-assets.internal/NanumGothic-Regular.ttf";
declare const REPORT_PDF_SOURCE_REVISION: string;

let configuredFontDataUrl: string | null = null;

function errorResponse(status: number, code: string) {
  return Response.json({ error: code }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-hairfit-error-code": code,
    },
  });
}

function sourceRevision() {
  return typeof REPORT_PDF_SOURCE_REVISION === "string" ? REPORT_PDF_SOURCE_REVISION : "local";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReportV2(value: unknown): value is ConsultationReportViewModelV2 {
  return isRecord(value) && value.schemaVersion === "consultation-report-view-model-v2";
}

function isReportV1(value: unknown): value is ConsultationReportViewModelV1 {
  return isRecord(value) && value.schemaVersion === "consultation-report-view-model-v1";
}

async function ensureFontSource(assets: Pick<Fetcher, "fetch">) {
  if (configuredFontDataUrl) return configuredFontDataUrl;
  const response = await assets.fetch(new Request(FONT_ASSET_URL));
  if (!response.ok) throw new Error("REPORT_PDF_FONT_UNAVAILABLE");
  const fontBytes = new Uint8Array(await response.arrayBuffer());
  if (fontBytes.byteLength < 10_000 || fontBytes.byteLength > 5 * 1024 * 1024) {
    throw new Error("INVALID_REPORT_PDF_FONT");
  }
  const dataUrl = `data:font/ttf;base64,${Buffer.from(fontBytes).toString("base64")}`;
  configureReportPdfFontSource(dataUrl);
  configuredFontDataUrl = dataUrl;
  return dataUrl;
}

export async function handleReportPdfRequest(request: Request, assets: Pick<Fetcher, "fetch">) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/render") {
    return errorResponse(404, "NOT_FOUND");
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REPORT_BODY_BYTES) {
    return errorResponse(413, "REPORT_PDF_PAYLOAD_TOO_LARGE");
  }

  try {
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    if (bodyBytes.byteLength === 0 || bodyBytes.byteLength > MAX_REPORT_BODY_BYTES) {
      return errorResponse(413, "REPORT_PDF_PAYLOAD_TOO_LARGE");
    }
    const report: unknown = JSON.parse(new TextDecoder().decode(bodyBytes));
    if (!isReportV1(report) && !isReportV2(report)) {
      return errorResponse(400, "INVALID_REPORT_PDF_PAYLOAD");
    }
    await ensureFontSource(assets);
    const pdf = isReportV2(report)
      ? await renderConsultationReportPdfV2(report)
      : await renderConsultationReportPdf(report);
    const bytes = new Uint8Array(pdf);
    if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("INVALID_PDF_OUTPUT");
    }
    return new Response(bytes, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/pdf",
        "x-content-type-options": "nosniff",
        "x-hairfit-source-revision": sourceRevision(),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "REPORT_PDF_RENDER_FAILED";
    console.error(JSON.stringify({ message: "report PDF render failed", code }));
    return errorResponse(500, code || "REPORT_PDF_RENDER_FAILED");
  }
}

export default {
  fetch(request, env) {
    return handleReportPdfRequest(request, env.REPORT_PDF_ASSETS);
  },
} satisfies ExportedHandler<ReportPdfEnv>;
