import type { ConsultationReportViewModelV2 } from "./report-v2.ts";

export type ConsultationReportSurfaceV1 = "web" | "native" | "pdf";

export interface ConsultationReportProjectionReceiptV1 {
  schemaVersion: "consultation-report-projection-receipt-v1";
  surface: ConsultationReportSurfaceV1;
  reportRevision: number;
  fingerprint: string;
  hairRequestedCount: 9;
  hairGeneratedCount: number;
  fashionRequestedCount: 0 | 3 | 6 | 9;
  fashionGeneratedCount: number;
  mismatch: boolean;
}

export const CONSULTATION_CANARY_FLAG_ORDER_V1 = [
  "FASHION_PRODUCT_TRUTH_ENABLED",
  "ONBOARDING_FASHION_PERSONALIZATION_ENABLED",
  "FASHION_TREND_SIGNALS_V2_ENABLED",
  "FASHION_ADAPTIVE_BATCH_ENABLED",
  "CONSULTATION_AI_LED_HAIR_DECISION_ENABLED",
] as const;

export type ConsultationCanaryFlagV1 = (typeof CONSULTATION_CANARY_FLAG_ORDER_V1)[number];

export function projectConsultationReportReceiptV1(
  report: ConsultationReportViewModelV2,
  surface: ConsultationReportSurfaceV1,
): ConsultationReportProjectionReceiptV1 {
  const hair = report.provenance.hair;
  const fashion = report.provenance.fashion;
  const sections = report.tabs.flatMap((tab) => tab.sections);
  const hairSection = sections.find((section) => section.key === "candidate-comparison");
  const fashionSection = sections.find((section) => section.key === "fashion-result");
  const hairGeneratedCount = hairSection?.key === "candidate-comparison" ? hairSection.payload.candidates.length : 0;
  const fashionGeneratedCount = fashionSection?.key === "fashion-result" ? fashionSection.payload.looks.length : 0;
  return {
    schemaVersion: "consultation-report-projection-receipt-v1",
    surface,
    reportRevision: report.provenance.reportRevision,
    fingerprint: report.provenance.fingerprint,
    hairRequestedCount: 9,
    hairGeneratedCount,
    fashionRequestedCount: fashion?.requestedCount ?? 0,
    fashionGeneratedCount,
    mismatch: Boolean(
      report.sourceFingerprint !== report.provenance.fingerprint
      || (hair && (hair.generatedPreviewIds.length !== hairGeneratedCount || hair.requestedCount !== 9))
      || (fashion && (fashion.generatedPreviewIds.length !== fashionGeneratedCount || fashion.requestedCount !== fashionGeneratedCount))
    ),
  };
}

export function assertMatchingConsultationReportReceiptsV1(receipts: ConsultationReportProjectionReceiptV1[]) {
  if (!receipts.length) throw new Error("REPORT_PROJECTION_RECEIPTS_REQUIRED");
  const baseline = receipts[0];
  for (const receipt of receipts) {
    if (receipt.mismatch) throw new Error("REPORT_PROJECTION_CONTENT_MISMATCH");
    if (receipt.reportRevision !== baseline.reportRevision || receipt.fingerprint !== baseline.fingerprint) {
      throw new Error("REPORT_PROJECTION_FINGERPRINT_MISMATCH");
    }
    if (receipt.hairGeneratedCount !== baseline.hairGeneratedCount
      || receipt.fashionGeneratedCount !== baseline.fashionGeneratedCount) {
      throw new Error("REPORT_PROJECTION_GENERATED_COUNT_MISMATCH");
    }
  }
}

export function nextConsultationCanaryFlagV1(enabled: ConsultationCanaryFlagV1[]) {
  const active = new Set(enabled);
  for (const flag of CONSULTATION_CANARY_FLAG_ORDER_V1) {
    if (!active.has(flag)) return flag;
  }
  return null;
}
