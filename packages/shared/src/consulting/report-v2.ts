import type { MakeupArtistBrief, MakeupDirectionSnapshot, MakeupRoutine } from "../makeup/contract.ts";
import type { MakeupDirectionProfessionalReportEnvelopeV1 } from "../makeup/professional-report.ts";
import { MAKEUP_MODE_LABELS } from "../makeup/interview.ts";
import type { PersonalColorProfileV2 } from "../personal-color-v2/contract.ts";
import type { AnalysisEvidenceV2 } from "../v2/analysis/contract.ts";
import type { FashionPreviewCandidateV2, FashionPreviewSetV2, SalonBriefV2 } from "../v2/outputs/contract.ts";
import type { ConsultationSnapshot, ConsultationStage, FashionPreviewBatch } from "./contract.ts";
import type { FashionOfferSnapshotV1 } from "./fashion-product-truth.ts";
import type { HairRecommendationDecisionV1 } from "./hair-recommendation.ts";
import type { HairProfileV2 } from "./hair-profile.ts";
import type { ConsultationReportNarrativeEnvelopeV1 } from "./report-narrative.ts";
import { consultationChangeIntensityLabel, consultationMaintenanceLabel } from "./presentation.ts";

export const CONSULTATION_REPORT_TAB_ORDER_V2 = ["hair", "color", "makeup", "fashion", "final"] as const;
export type ConsultationReportTabKeyV2 = (typeof CONSULTATION_REPORT_TAB_ORDER_V2)[number];
export type ConsultationReportStatusV2 = "ready" | "partial" | "unavailable" | "redacted";
export type ConsultationReportProfileV2 = "full_journey" | "salon_handoff";

export interface ConsultationReportImageV2 {
  id: string;
  src: string | null;
  alt: string;
  label: string;
  status: "ready" | "pending" | "failed";
}

export interface ConsultationReportSourceV2 {
  analysisEvidence?: AnalysisEvidenceV2 | null;
  personalColorProfile?: PersonalColorProfileV2 | null;
  salonBrief?: SalonBriefV2 | null;
  makeupDirection?: MakeupDirectionSnapshot | null;
  makeupMoodImageUrl?: string | null;
  makeupRoutine?: MakeupRoutine | null;
  makeupArtistBrief?: MakeupArtistBrief | null;
  makeupProfessionalReport?: MakeupDirectionProfessionalReportEnvelopeV1 | null;
  hairProfile?: HairProfileV2 | null;
  hairRecommendation?: HairRecommendationDecisionV1 | null;
  fashionBatch?: FashionPreviewBatch | null;
  fashionPreviewSet?: FashionPreviewSetV2 | null;
  fashionCandidates?: FashionPreviewCandidateV2[];
  fashionOfferSnapshots?: FashionOfferSnapshotV1[];
  fashionPersonalizationSnapshotId?: string | null;
}

interface SectionBaseV2<TKey extends string, TTab extends ConsultationReportTabKeyV2, TPayload> {
  key: TKey;
  tab: TTab;
  title: string;
  kicker: string;
  status: ConsultationReportStatusV2;
  conclusion: string;
  rationale: string[];
  effects: string[];
  avoid: string[];
  cautions: string[];
  detailHref: string | null;
  payload: TPayload;
}

export type FaceHairAnalysisSectionV2 = SectionBaseV2<
  "face-hair-analysis",
  "hair",
  {
    distribution: Array<{ label: string; probability: number }>;
    primary: string | null;
    secondary: string | null;
    measurements: Array<{
      label: string;
      value: string;
      confidence: number | null;
    }>;
    observations: Array<{ label: string; value: string }>;
    confidence: string;
  }
>;

export type HairDirectionSectionV2 = SectionBaseV2<
  "hair-direction",
  "hair",
  {
    revision: number;
    axes: Array<{
      label: string;
      value: string;
      reason: string | null;
      impact: string | null;
    }>;
  }
>;

export type CandidateComparisonSectionV2 = SectionBaseV2<
  "candidate-comparison",
  "hair",
  {
    candidates: Array<{
      id: string;
      label: string;
      axis: string;
      reason: string;
      gridRole: string;
      rank: number | null;
      isPrimary: boolean;
      isConfirmed: boolean;
      generationState: "pending" | "generating" | "accepted" | "failed";
      image: ConsultationReportImageV2;
    }>;
    requestedCount: 9;
    terminalCount: number;
    acceptedCount: number;
  }
>;

export type FinalHairSectionV2 = SectionBaseV2<
  "final-hair",
  "hair",
  {
    selectionId: string;
    label: string;
    image: ConsultationReportImageV2;
    feasibility: string;
    currentHairGap: string;
    services: string[];
    maintenance: string;
    selectedAt: string;
  }
>;

export type PersonalColorSectionV2 = SectionBaseV2<
  "personal-color",
  "color",
  {
    classification: string | null;
    secondary: string | null;
    posterior: Array<{ label: string; probability: number }>;
    axes: Array<{
      key: string;
      label: string;
      value: number | null;
      confidence: number | null;
    }>;
    palettes: {
      best: string[];
      base: string[];
      accent: string[];
      challenge: string[];
      metals: string[];
    };
    confidence: { capture: number | null; diagnosis: number | null };
  }
>;

export type FinalColorSectionV2 = SectionBaseV2<
  "final-color",
  "color",
  {
    state: string;
    colorName: string;
    swatchHex: string;
    technique: string;
    targetLevel: number | null;
    bleachPolicy: string;
    maintenance: string;
    fadeDirection: string;
    image: ConsultationReportImageV2 | null;
    confirmedAt: string | null;
  }
>;

export type MakeupResultSectionV2 = SectionBaseV2<
  "makeup-result",
  "makeup",
  {
    moodImage: ConsultationReportImageV2 | null;
    requestedMode: string | null;
    acceptedMode: string | null;
    adjustmentDecision: string | null;
    rationaleRevision: number | null;
    evidence: Array<{ label: string; finding: string; impact: string }>;
    limitations: string[];
    modules: Array<{
      module: string;
      enabled: boolean;
      color: string | null;
      texture: string | null;
      intensity: number | null;
      reasons: string[];
    }>;
    routine?: MakeupRoutine | null;
    artistBrief?: MakeupArtistBrief | null;
    professionalReport?: MakeupDirectionProfessionalReportEnvelopeV1 | null;
    confirmedAt: string | null;
  }
>;

export type FashionResultSectionV2 = SectionBaseV2<
  "fashion-result",
  "fashion",
  {
    looks: Array<{
      role: string;
      id: string;
      label: string;
      category: string;
      palette: string[];
      silhouette: string;
      neckline: string;
      items: string[];
      shoppingKeywords: string[];
      generationState: string;
      isRecommended: boolean;
      isSelected: boolean;
      image: ConsultationReportImageV2 | null;
    }>;
    requestedCount: 3 | 6 | 9;
    terminalCount: number;
    completedCount: number;
    recommendedPreviewId: string | null;
    selectedPreviewId: string | null;
    products: Array<{
      snapshotId: string;
      brandName: string;
      productName: string;
      category: string;
      priceAmount: number;
      currency: "KRW";
      availability: string;
      availableSizes: string[];
      sellerId: string;
      productUrl: string;
      imageUrl: string | null;
      observedAt: string;
      expiresAt: string;
    }>;
    selectedAt: string | null;
  }
>;

export interface ConsultingResultProvenanceV3 {
  schemaVersion: "consulting-result-provenance-v3";
  consultationId: string;
  reportRevision: number;
  hair: {
    previewBatchId: string;
    requestedCount: 9;
    terminalCount: number;
    recommendationRevision: number;
    primaryPreviewId: string;
    confirmedPreviewId: string;
    selectionSource: "ai_primary" | "customer_choice";
    confirmedRevision: number;
    rationaleRevision: number;
    adjustmentRevision: number | null;
    generatedPreviewIds: string[];
  } | null;
  fashion: {
    batchId: string;
    requestedCount: 3 | 6 | 9;
    terminalCount: number;
    generatedPreviewIds: string[];
    selectedPreviewId: string;
    recommendedPreviewId: string;
    personalizationSnapshotId: string | null;
    productOfferSnapshotIds: string[];
    generationRevision: number;
  } | null;
  colorRevision: number | null;
  makeupRevision: number | null;
  sourceIds: string[];
  fingerprint: string;
  generatedAt: string;
}

export type ExecutiveSummarySectionV2 = SectionBaseV2<
  "executive-summary",
  "final",
  {
    heroImage: ConsultationReportImageV2 | null;
    outcomes: Array<{
      label: "헤어" | "컬러" | "메이크업" | "패션";
      value: string;
    }>;
    changeIntensity: string;
    maintenanceDifficulty: string;
    salonRequired: boolean;
  }
>;

export type SalonSpecificationSectionV2 = SectionBaseV2<
  "salon-specification",
  "final",
  {
    customerSummary: string;
    version: number;
    services: { cut: string[]; perm: string[]; color: string[] };
    design: Array<{ label: string; value: string }>;
    styling: string[];
    cautions: string[];
    unresolved: string[];
  }
>;

export type InitialCareSectionV2 = SectionBaseV2<
  "initial-care",
  "final",
  {
    sourceSelectionId: string | null;
    sourceColorSelectionId: string | null;
    periods: Array<{
      label: "24시간" | "첫 3일" | "첫 7일";
      actions: string[];
    }>;
    checklist: string[];
    escalationSigns: string[];
  }
>;

export type ConsultationReportSectionV2 = FaceHairAnalysisSectionV2 | HairDirectionSectionV2 | CandidateComparisonSectionV2 | FinalHairSectionV2 | PersonalColorSectionV2 | FinalColorSectionV2 | MakeupResultSectionV2 | FashionResultSectionV2 | ExecutiveSummarySectionV2 | SalonSpecificationSectionV2 | InitialCareSectionV2;

export interface ConsultationReportTabV2 {
  key: ConsultationReportTabKeyV2;
  label: string;
  sections: ConsultationReportSectionV2[];
}

export interface ConsultationReportViewModelV2 {
  schemaVersion: "consultation-report-view-model-v2";
  reportId: string;
  consultationId: string;
  consultationVersion: number;
  resultVersion: number;
  viewModelVersion: 2;
  rendererVersion: "report-pdf-v2";
  profile: ConsultationReportProfileV2;
  generatedAt: string;
  refreshedAt: string;
  headline: string;
  status: ConsultationReportStatusV2;
  defaultTab: "final";
  tabs: ConsultationReportTabV2[];
  sourceFingerprint: string;
  provenance: ConsultingResultProvenanceV3;
  integrityCode: string;
  rawPhotoIncluded: false;
  afterPhotoIncluded: false;
  limitations: string[];
  narrative?: ConsultationReportNarrativeEnvelopeV1;
}

const TAB_LABELS: Record<ConsultationReportTabKeyV2, string> = {
  hair: "헤어",
  color: "염색",
  makeup: "메이크업",
  fashion: "패션",
  final: "최종",
};

const STATUS_LABELS: Record<ConsultationReportStatusV2, string> = {
  ready: "완료",
  partial: "확인 가능한 결과",
  unavailable: "자료를 불러오지 못함",
  redacted: "개인정보 보호로 제외",
};

const AXIS_LABELS: Record<string, string> = {
  temperature: "온도감",
  value: "명도",
  chroma: "채도",
  contrast: "대비",
  hueCharacter: "색상 성격",
};

function present(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "확인 전" ? normalized : null;
}

function stageHref(sessionId: string, stage: ConsultationStage) {
  return `/consulting/${encodeURIComponent(sessionId)}/${stage}`;
}

function fingerprint(value: string) {
  const source = value;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedDistribution(entries: Array<{ label: string; value: number }>) {
  const valid = entries.filter((entry) => entry.label.trim() && Number.isFinite(entry.value) && entry.value > 0);
  const total = valid.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return [];
  return valid.map((entry) => ({ label: entry.label, probability: entry.value / total })).sort((left, right) => right.probability - left.probability);
}

function analysisDistribution(source: ConsultationReportSourceV2) {
  const shape = source.analysisEvidence?.faceShape;
  if (!shape) return [];
  return normalizedDistribution(Object.entries(shape.blend).map(([label, value]) => ({ label, value })));
}

function personalColorPosterior(snapshot: ConsultationSnapshot, source: ConsultationReportSourceV2) {
  if (source.personalColorProfile?.seasonalPosterior.length) {
    return source.personalColorProfile.seasonalPosterior.map((item) => ({
      label: item.type,
      probability: item.probability,
    }));
  }
  return normalizedDistribution(Object.entries(snapshot.personalColorDiagnosis.blend).map(([label, value]) => ({ label, value })));
}

function reportImage(id: string, src: string | null, alt: string, label: string, status: ConsultationReportImageV2["status"] = src ? "ready" : "pending"): ConsultationReportImageV2 {
  return { id, src, alt, label, status };
}

function buildProvenance(snapshot: ConsultationSnapshot, source: ConsultationReportSourceV2): ConsultingResultProvenanceV3 {
  const hair =
    source.hairRecommendation?.primaryPreviewId && source.hairRecommendation.confirmedPreviewId && source.hairRecommendation.confirmedRevision && source.hairRecommendation.selectionSource
      ? {
          previewBatchId: source.hairRecommendation.previewBatch.batchId,
          requestedCount: 9 as const,
          terminalCount: source.hairRecommendation.previewBatch.terminalCount,
          recommendationRevision: source.hairRecommendation.revision,
          primaryPreviewId: source.hairRecommendation.primaryPreviewId,
          confirmedPreviewId: source.hairRecommendation.confirmedPreviewId,
          selectionSource: source.hairRecommendation.selectionSource,
          confirmedRevision: source.hairRecommendation.confirmedRevision,
          rationaleRevision: source.hairRecommendation.revision,
          adjustmentRevision: source.hairRecommendation.supersedesRevision,
          generatedPreviewIds: snapshot.previews.map((item) => item.id),
        }
      : null;
  const fashionSelectedId = source.fashionBatch?.selectedPreviewId ?? source.fashionPreviewSet?.selectedStylingSessionId ?? snapshot.fashion.lookId;
  const fashionRecommendedId = source.fashionBatch?.recommendedPreviewId ?? fashionSelectedId;
  const fashion =
    source.fashionBatch && fashionSelectedId && fashionRecommendedId
      ? {
          batchId: source.fashionBatch.id,
          requestedCount: source.fashionBatch.requestedCount,
          terminalCount: source.fashionBatch.terminalCount,
          generatedPreviewIds: (source.fashionCandidates ?? []).map((item) => item.stylingSessionId),
          selectedPreviewId: fashionSelectedId,
          recommendedPreviewId: fashionRecommendedId,
          personalizationSnapshotId: source.fashionPersonalizationSnapshotId ?? null,
          productOfferSnapshotIds: (source.fashionOfferSnapshots ?? []).map((item) => item.snapshotId),
          generationRevision: source.fashionBatch.revision,
        }
      : null;
  const sourceIds = [snapshot.result.id, source.analysisEvidence?.id, source.personalColorProfile?.id, source.salonBrief ? `${source.salonBrief.consultationId}:brief:${source.salonBrief.version}` : null, source.makeupDirection?.id, source.makeupRoutine?.id, source.makeupArtistBrief?.id, hair?.previewBatchId, fashion?.batchId, fashion?.personalizationSnapshotId, ...(hair?.generatedPreviewIds ?? []), ...(fashion?.generatedPreviewIds ?? []), ...(fashion?.productOfferSnapshotIds ?? [])].filter((item): item is string => Boolean(item));
  const generatedAt = snapshot.result.compiledAt ?? snapshot.updatedAt;
  const fingerprintSource = JSON.stringify({
    consultationId: snapshot.sessionId,
    consultationVersion: snapshot.version,
    resultVersion: Math.max(1, snapshot.result.version),
    hair,
    fashion,
    colorRevision: snapshot.colorDecision.revision,
    makeupRevision: source.makeupDirection?.version ?? null,
    sourceIds,
    makeupProfessionalReportFingerprint: source.makeupProfessionalReport?.outputFingerprint ?? null,
    generatedAt,
  });
  return {
    schemaVersion: "consulting-result-provenance-v3",
    consultationId: snapshot.sessionId,
    reportRevision: Math.max(1, snapshot.result.version),
    hair,
    fashion,
    colorRevision: snapshot.colorDecision.revision,
    makeupRevision: source.makeupDirection?.version ?? null,
    sourceIds,
    fingerprint: fingerprint(fingerprintSource),
    generatedAt,
  };
}

function selectedHair(snapshot: ConsultationSnapshot) {
  return snapshot.selectedStyleHistory.at(-1) ?? null;
}

function buildInitialCare(snapshot: ConsultationSnapshot): InitialCareSectionV2 | null {
  const selected = selectedHair(snapshot);
  const color = snapshot.colorDecision;
  const colorApplied = color.state === "confirmed";
  if (!selected && !colorApplied) return null;
  const permLikely = selected?.services.some((service) => /펌|perm|컬/i.test(service)) ?? false;
  const periods: InitialCareSectionV2["payload"]["periods"] = [
    {
      label: "24시간",
      actions: ["두피와 모발에 강한 마찰을 주지 마세요.", "과도한 열기구와 꽉 묶는 스타일을 피하세요."],
    },
    {
      label: "첫 3일",
      actions: ["미지근한 물과 순한 제품으로 부드럽게 세정하세요.", "젖은 모발을 비비지 말고 눌러 물기를 제거한 뒤 완전히 말리세요."],
    },
    {
      label: "첫 7일",
      actions: ["수영장·사우나·강한 자외선 노출을 줄이세요.", "모발 끝과 손상 부위 중심으로 보습 상태를 확인하세요."],
    },
  ];
  if (colorApplied) {
    periods[0].actions.push("밝은 수건·의류와의 이염 가능성을 확인하세요.");
    periods[1].actions.push("컬러 전용 또는 저자극 세정 제품을 우선 사용하세요.");
  }
  if (permLikely) periods[1].actions.push("컬과 볼륨을 늘이거나 강하게 빗어 펴지 마세요.");
  const checklist = periods.flatMap((period) => period.actions).slice(0, 7);
  return {
    key: "initial-care",
    tab: "final",
    title: "초기 케어",
    kicker: "처음 관리할 내용",
    status: "ready",
    conclusion: "확정한 헤어와 컬러를 안정적으로 유지하기 위한 첫 7일 안내입니다.",
    rationale: [selected ? `${selected.label}의 구조와 관리 조건을 반영했습니다.` : "확정 컬러 조건을 반영했습니다.", colorApplied ? `${color.colorName}의 초기 색 유지 조건을 반영했습니다.` : "염색 전용 항목은 포함하지 않았습니다."],
    effects: ["초기 마찰·열·수분 손상을 줄이고 형태와 색의 안정화를 돕습니다."],
    avoid: ["강한 마찰", "고온 열기구", "장시간 젖은 상태"],
    cautions: ["따가움·부기·진물·심한 두피 통증이 지속되면 시술 살롱 또는 의료 전문가와 상담하세요."],
    detailHref: null,
    payload: {
      sourceSelectionId: selected?.id ?? null,
      sourceColorSelectionId: color.id,
      periods,
      checklist,
      escalationSigns: ["지속되는 두피 통증", "부기·진물", "급격한 끊김 또는 과도한 탈락"],
    },
  };
}

export function consultationReportStatusLabelV2(status: ConsultationReportStatusV2) {
  return STATUS_LABELS[status];
}

export function projectConsultationReportV2(snapshot: ConsultationSnapshot, source: ConsultationReportSourceV2 = {}, profile: ConsultationReportProfileV2 = "full_journey"): ConsultationReportViewModelV2 {
  const selected = selectedHair(snapshot);
  const accepted = snapshot.previews.filter((item) => item.status === "accepted");
  const analysisPrimary = present(source.analysisEvidence?.faceShape.primary) ?? present(snapshot.faceAnalysis.faceShape);
  const analysisSecondary = present(source.analysisEvidence?.faceShape.secondary ?? undefined);
  const distribution = analysisDistribution(source);
  const sections: ConsultationReportSectionV2[] = [];

  if (analysisPrimary || snapshot.evidence.items.length || source.analysisEvidence) {
    const hairObservations =
      source.hairProfile?.observed.map((item) => ({
        label: item.traitId,
        value: `${item.value} · ${Math.round(item.confidence * 100)}%`,
      })) ?? [];
    const hairUnknown = source.hairProfile?.unknownFieldIds ?? [];
    sections.push({
      key: "face-hair-analysis",
      tab: "hair",
      title: "얼굴·모발 분석",
      kicker: "얼굴과 모발의 균형",
      status: source.analysisEvidence && distribution.length && source.hairProfile ? "ready" : "partial",
      conclusion: source.analysisEvidence?.faceShape.summary || `${analysisPrimary ?? "확인 가능한 특징"}을 기준으로 헤어 균형을 해석했습니다.`,
      rationale: snapshot.evidence.items.slice(0, 5).map((item) => `${item.evidence} → ${item.meaning}`),
      effects: snapshot.evidence.items.slice(0, 5).map((item) => item.action),
      avoid: [],
      cautions: [...(source.analysisEvidence ? [] : ["정밀 얼굴형 분포가 없어 확인 가능한 관찰만 표시합니다."]), ...(hairUnknown.length ? [`사진으로 확인할 수 없는 모질 ${hairUnknown.length}개 항목은 미확인으로 유지합니다.`] : [])],
      detailHref: stageHref(snapshot.sessionId, "analysis"),
      payload: {
        distribution,
        primary: analysisPrimary,
        secondary: analysisSecondary,
        measurements: (source.analysisEvidence?.measurements ?? []).map((item) => ({
          label: item.explanation || item.category,
          value: `${Math.round(item.normalizedValue * 100) / 100}`,
          confidence: item.confidence,
        })),
        observations: [
          ["균형", present(snapshot.faceAnalysis.balance)],
          ["헤어라인", present(snapshot.faceAnalysis.hairline)],
          ["모량", present(snapshot.faceAnalysis.density)],
        ]
          .filter((item): item is [string, string] => Boolean(item[1]))
          .map(([label, value]) => ({ label, value }))
          .concat(hairObservations),
        confidence: snapshot.faceAnalysis.confidence,
      },
    });
  }

  if (snapshot.strategy.confirmedAt || snapshot.strategyRecommendations.length) {
    const axisEntries = [
      ["length", "기장", snapshot.strategy.length],
      ["fringe", "앞머리", snapshot.strategy.fringe],
      ["parting", "가르마", snapshot.strategy.parting],
      ["layerStart", "레이어", snapshot.strategy.layerStart],
      ["crownVolume", "정수리 볼륨", snapshot.strategy.crownVolume],
      ["sideVolume", "측면 볼륨", snapshot.strategy.sideVolume],
      ["texture", "질감", snapshot.strategy.texture],
      ["color", "컬러 방향", snapshot.strategy.color],
    ] as const;
    sections.push({
      key: "hair-direction",
      tab: "hair",
      title: "헤어 디자인 방향",
      kicker: "추천 헤어 방향",
      status: snapshot.strategy.confirmedAt ? "ready" : "partial",
      conclusion: "얼굴·모발 특징과 관리 조건을 8개 설계 축으로 정리했습니다.",
      rationale: snapshot.strategyRecommendations.map((item) => item.reason),
      effects: snapshot.strategyRecommendations.map((item) => item.impact),
      avoid: snapshot.strategyRecommendations.map((item) => item.tradeoff).filter(Boolean),
      cautions: [],
      detailHref: stageHref(snapshot.sessionId, "direction"),
      payload: {
        revision: snapshot.strategy.revision,
        axes: axisEntries.map(([key, label, value]) => {
          const recommendation = snapshot.strategyRecommendations.find((item) => item.axis === key);
          return {
            label,
            value,
            reason: recommendation?.reason ?? null,
            impact: recommendation?.impact ?? null,
          };
        }),
      },
    });
  }

  if (snapshot.previews.length) {
    const rankedById = new Map((source.hairRecommendation?.rankedPreviews ?? []).map((item) => [item.previewId, item]));
    const primaryPreviewId = source.hairRecommendation?.primaryPreviewId ?? snapshot.finalist.finalistPreviewId;
    const confirmedPreviewId = selected?.previewId ?? null;
    const candidates: CandidateComparisonSectionV2["payload"]["candidates"] = snapshot.previews.map((item, index) => {
      const ranked = rankedById.get(item.id);
      return {
        id: item.id,
        label: item.label,
        axis: item.axis,
        reason: item.reason,
        gridRole: ranked?.gridRole ?? `generated-slot-${index + 1}`,
        rank: ranked?.rank ?? null,
        isPrimary: item.id === primaryPreviewId,
        isConfirmed: item.id === confirmedPreviewId,
        generationState: item.status,
        image: reportImage(item.id, item.imageUrl, `${item.label} 헤어 생성 결과`, `${index + 1}. ${item.label}`, item.status === "failed" ? "failed" : item.imageUrl ? "ready" : "pending"),
      };
    });
    const terminalCount = source.hairRecommendation?.previewBatch.terminalCount ?? snapshot.previews.filter((item) => item.status === "accepted" || item.status === "failed").length;
    sections.push({
      key: "candidate-comparison",
      tab: "hair",
      title: "추천 헤어 비교",
      kicker: "헤어 스타일 비교",
      status: candidates.length === 9 && terminalCount === 9 ? "ready" : "partial",
      conclusion: "준비한 헤어 스타일을 한눈에 비교하고, AI 추천과 내가 확정한 결과를 함께 확인할 수 있습니다.",
      rationale:
        source.hairRecommendation?.rankedPreviews
          .slice()
          .sort((left, right) => left.rank - right.rank)
          .map((item) => `${item.rank}순위 · ${item.reasonCodes.join(" · ") || "얼굴·모발 조건을 종합한 추천"}`) ?? [],
      effects: ["추천 순서와 선택 이유를 함께 보며 원하는 인상을 비교할 수 있습니다."],
      avoid: [],
      cautions: candidates.length !== 9 ? ["일부 스타일은 아직 준비 중입니다. 준비된 결과부터 확인할 수 있습니다."] : terminalCount !== 9 ? ["남은 스타일을 준비하고 있습니다. 현재 결과는 계속 확인할 수 있습니다."] : [],
      detailHref: stageHref(snapshot.sessionId, "previews"),
      payload: {
        requestedCount: 9,
        terminalCount,
        acceptedCount: accepted.length,
        candidates,
      },
    });
  }

  if (selected) {
    sections.push({
      key: "final-hair",
      tab: "hair",
      title: "최종 헤어",
      kicker: "확정한 헤어",
      status: selected.imageUrl ? "ready" : "partial",
      conclusion: selected.reason || `${selected.label}을 최종 헤어로 확정했습니다.`,
      rationale: [selected.feasibility, selected.currentHairGap].filter(Boolean),
      effects: [selected.maintenance].filter(Boolean),
      avoid: selected.limitations,
      cautions: selected.limitations,
      detailHref: stageHref(snapshot.sessionId, "decision"),
      payload: {
        selectionId: selected.id,
        label: selected.label,
        image: reportImage(selected.id, selected.imageUrl, `${selected.label} 확정 헤어`, "확정 헤어"),
        feasibility: selected.feasibility,
        currentHairGap: selected.currentHairGap,
        services: selected.services,
        maintenance: selected.maintenance,
        selectedAt: selected.selectedAt,
      },
    });
  }

  const personalColorStarted = source.personalColorProfile || snapshot.personalColorDiagnosis.state !== "pending";
  if (personalColorStarted) {
    const profile = source.personalColorProfile;
    const axes = profile
      ? Object.entries(profile.axes).map(([key, axis]) => ({
          key,
          label: AXIS_LABELS[key] ?? key,
          value: axis.value,
          confidence: axis.confidence,
        }))
      : Object.entries(snapshot.personalColorDiagnosis.axes).map(([key, value]) => ({
          key,
          label: AXIS_LABELS[key] ?? key,
          value,
          confidence: snapshot.personalColorDiagnosis.qualityConfidence,
        }));
    const ready = profile ? ["profile_ready", "confirmed", "partial_ready"].includes(profile.status) : snapshot.personalColorDiagnosis.state === "ready";
    sections.push({
      key: "personal-color",
      tab: "color",
      title: "퍼스널 컬러",
      kicker: "어울리는 컬러",
      status: ready ? "ready" : snapshot.personalColorDiagnosis.state === "unavailable" ? "unavailable" : "partial",
      conclusion: profile?.displayClassification?.label || snapshot.personalColorDiagnosis.summary || snapshot.personalColorDiagnosis.primaryType || "확인 가능한 컬러 근거를 정리했습니다.",
      rationale: snapshot.personalColorDiagnosis.bestColors.slice(0, 5).map((item) => item.reason),
      effects: snapshot.personalColorDiagnosis.hairColorHints,
      avoid: snapshot.personalColorDiagnosis.avoidColors.slice(0, 5).map((item) => item.nameKo),
      cautions: snapshot.personalColorDiagnosis.warnings,
      detailHref: stageHref(snapshot.sessionId, "personal-color"),
      payload: {
        classification: profile?.displayClassification?.label ?? snapshot.personalColorDiagnosis.primaryType,
        secondary: snapshot.personalColorDiagnosis.secondaryType,
        posterior: personalColorPosterior(snapshot, source),
        axes,
        palettes: profile?.harmonyPalette ?? {
          best: snapshot.personalColorDiagnosis.palette.best,
          base: snapshot.personalColorDiagnosis.palette.neutrals,
          accent: snapshot.personalColorDiagnosis.palette.accents,
          challenge: snapshot.personalColorDiagnosis.palette.caution,
          metals: snapshot.personalColorDiagnosis.palette.metals,
        },
        confidence: {
          capture: snapshot.personalColorDiagnosis.qualityConfidence,
          diagnosis: profile?.confidence.overall ?? snapshot.personalColorDiagnosis.qualityConfidence,
        },
      },
    });
  }

  const colorTerminal = ["confirmed", "keep-current", "deferred", "salon-review", "not-applicable"].includes(snapshot.colorDecision.state);
  if (colorTerminal || snapshot.colorDecision.state !== "not-applicable") {
    const color = snapshot.colorDecision;
    sections.push({
      key: "final-color",
      tab: "color",
      title: "최종 컬러",
      kicker: "확정한 컬러",
      status: colorTerminal ? "ready" : "partial",
      conclusion: color.state === "confirmed" ? `${color.colorName} 컬러를 확정했습니다.` : color.state === "keep-current" || color.state === "not-applicable" ? "현재 모발색을 유지합니다." : "살롱 확인이 필요한 컬러 결정입니다.",
      rationale: snapshot.personalColorDiagnosis.hairColorHints,
      effects: [color.maintenance, color.fadeDirection].filter(Boolean),
      avoid: [],
      cautions: color.warnings,
      detailHref: stageHref(snapshot.sessionId, "color-studio"),
      payload: {
        state: color.state,
        colorName: color.colorName,
        swatchHex: color.swatchHex,
        technique: color.technique,
        targetLevel: color.targetLevel,
        bleachPolicy: color.bleachPolicy,
        maintenance: color.maintenance,
        fadeDirection: color.fadeDirection,
        image: color.finalImageUrl ? reportImage(color.id ?? "final-color", color.finalImageUrl, `${color.colorName} 염색 결과`, "확정 컬러") : null,
        confirmedAt: color.confirmedAt,
      },
    });
  }

  const makeupState = source.makeupDirection?.status ?? snapshot.makeupDirection?.status ?? "not-started";
  if (makeupState !== "not-started") {
    const modules =
      source.makeupDirection?.modules.map((item) => ({
        module: item.module,
        enabled: item.state === "enabled" && item.direction.enabled,
        color: item.direction.colorFamily,
        texture: item.direction.texture,
        intensity: item.direction.intensity,
        reasons: item.direction.reasons,
      })) ?? [];
    const makeupRationale = source.makeupDirection?.rationale;
    sections.push({
      key: "makeup-result",
      tab: "makeup",
      title: "메이크업 결과",
      kicker: "추천 메이크업",
      status: modules.length === 7 ? "ready" : makeupState === "failed_retryable" ? "unavailable" : "partial",
      conclusion: makeupRationale?.acceptedMode ? `${MAKEUP_MODE_LABELS[makeupRationale.acceptedMode]} 방향을 확정했습니다.` : "퍼스널 컬러와 확정 헤어에 맞춘 메이크업 방향입니다.",
      rationale: makeupRationale?.evidence.map((item) => `${item.label} · ${item.finding}`) ?? modules.flatMap((item) => item.reasons).slice(0, 5),
      effects: ["헤어·컬러·메이크업의 온도감과 대비를 일관되게 연결합니다."],
      avoid: modules.filter((item) => !item.enabled).map((item) => `${item.module} 비활성`),
      cautions: makeupRationale?.limitations ?? (modules.length ? [] : ["확정 모듈 상세가 없어 상태만 표시합니다."]),
      detailHref: stageHref(snapshot.sessionId, "makeup"),
      payload: {
        moodImage: source.makeupMoodImageUrl ? reportImage("makeup-mood", source.makeupMoodImageUrl, "확정 메이크업 무드", "메이크업 무드") : null,
        requestedMode: makeupRationale ? MAKEUP_MODE_LABELS[makeupRationale.requestedMode] : null,
        acceptedMode: makeupRationale?.acceptedMode ? MAKEUP_MODE_LABELS[makeupRationale.acceptedMode] : null,
        adjustmentDecision: makeupRationale?.decision ?? null,
        rationaleRevision: makeupRationale?.revision ?? null,
        evidence:
          makeupRationale?.evidence.map(({ label, finding, impact }) => ({
            label,
            finding,
            impact,
          })) ?? [],
        limitations: makeupRationale?.limitations ?? [],
        modules,
        routine: source.makeupRoutine ?? null,
        artistBrief: source.makeupArtistBrief ?? null,
        professionalReport: source.makeupProfessionalReport ?? null,
        confirmedAt: source.makeupDirection?.confirmedAt ?? snapshot.makeupDirection?.confirmedAt ?? null,
      },
    });
  }

  const fashionSelected = source.fashionPreviewSet?.selectedLook ?? (snapshot.fashion.lookId ? snapshot.fashion : null);
  if (fashionSelected) {
    const selectedId = source.fashionPreviewSet?.selectedStylingSessionId ?? snapshot.fashion.lookId ?? "fashion-final";
    const candidates = source.fashionCandidates ?? [];
    const requestedCount = source.fashionBatch?.requestedCount ?? (candidates.length >= 9 ? 9 : candidates.length >= 6 ? 6 : 3);
    const recommendedId = source.fashionBatch?.recommendedPreviewId ?? selectedId;
    const looks: FashionResultSectionV2["payload"]["looks"] = candidates.map((item, index) => ({
      role: source.fashionBatch?.slotRoles[item.slotId] ?? `generated-slot-${index + 1}`,
      id: item.stylingSessionId,
      label: item.headline,
      category: item.category,
      palette: item.palette,
      silhouette: item.silhouette,
      neckline: item.neckline,
      items: item.items.map((entry) => `${entry.slot}: ${entry.name}`),
      shoppingKeywords: item.shoppingKeywords,
      generationState: item.status,
      isRecommended: item.stylingSessionId === recommendedId,
      isSelected: item.stylingSessionId === selectedId,
      image: reportImage(item.stylingSessionId, item.imageUrl, `${item.headline} 패션 생성 결과`, `${index + 1}. ${item.headline}`, item.status === "failed" ? "failed" : item.imageUrl ? "ready" : "pending"),
    }));
    if (!looks.length) {
      looks.push({
        role: "selected",
        id: selectedId,
        label: fashionSelected.label,
        category: fashionSelected.category ?? "FINAL",
        palette: fashionSelected.palette,
        silhouette: fashionSelected.silhouette,
        neckline: fashionSelected.neckline,
        items: fashionSelected.items.map((item) => `${item.slot}: ${item.name}`),
        shoppingKeywords: fashionSelected.shoppingKeywords,
        generationState: "selected",
        isRecommended: true,
        isSelected: true,
        image: null,
      });
    }
    const completedCount = source.fashionBatch?.completedCount ?? candidates.filter((item) => item.status === "completed").length;
    const terminalCount = source.fashionBatch?.terminalCount ?? candidates.filter((item) => item.status === "completed" || item.status === "failed").length;
    const products = (source.fashionOfferSnapshots ?? []).map((item) => ({
      snapshotId: item.snapshotId,
      brandName: item.brandName,
      productName: item.productName,
      category: item.category,
      priceAmount: item.price.amount,
      currency: item.price.currency,
      availability: item.availability,
      availableSizes: item.availableSizes,
      sellerId: item.sellerId,
      productUrl: item.productUrl,
      imageUrl: item.imageUrl,
      observedAt: item.observedAt,
      expiresAt: item.expiresAt,
    }));
    sections.push({
      key: "fashion-result",
      tab: "fashion",
      title: "추천 패션 비교",
      kicker: "패션 스타일 비교",
      status: looks.length === requestedCount && terminalCount === requestedCount ? "ready" : "partial",
      conclusion: "헤어·컬러·메이크업과 자연스럽게 이어지는 패션 제안을 비교하고, 추천안과 내가 고른 스타일을 확인할 수 있습니다.",
      rationale: ["확정한 헤어·컬러·메이크업과 실루엣·팔레트를 연결했습니다.", snapshot.fashion.direction].filter(Boolean),
      effects: [fashionSelected.silhouette, fashionSelected.neckline].filter(Boolean),
      avoid: snapshot.fashion.avoidCombinations,
      cautions: [...(looks.length !== requestedCount ? ["일부 패션 제안은 아직 준비 중입니다. 준비된 결과부터 확인할 수 있습니다."] : []), ...(terminalCount !== requestedCount ? ["남은 패션 제안을 준비하고 있습니다. 현재 결과는 계속 확인할 수 있습니다."] : []), ...(products.length ? [] : ["연결된 상품이 없어 스타일 조합과 쇼핑 키워드만 안내합니다."])],
      detailHref: stageHref(snapshot.sessionId, "fashion"),
      payload: {
        looks,
        requestedCount,
        terminalCount,
        completedCount,
        recommendedPreviewId: recommendedId,
        selectedPreviewId: selectedId,
        products,
        selectedAt: snapshot.fashion.selectedAt,
      },
    });
  }

  const heroSrc = snapshot.colorDecision.finalImageUrl || snapshot.result.heroImageUrl || selected?.imageUrl || null;
  const outcomes: ExecutiveSummarySectionV2["payload"]["outcomes"] = [
    { label: "헤어", value: selected?.label || "확정 전" },
    {
      label: "컬러",
      value: snapshot.colorDecision.state === "confirmed" ? snapshot.colorDecision.colorName : "현재 컬러 유지",
    },
    {
      label: "메이크업",
      value: makeupState === "not-started" ? "결과 없음" : "확정 방향 보기",
    },
    { label: "패션", value: snapshot.fashion.label || "결과 없음" },
  ];
  sections.push({
    key: "executive-summary",
    tab: "final",
    title: "종합 컨설팅 결론",
    kicker: "한눈에 보는 결과",
    status: selected ? "ready" : "partial",
    conclusion: selected ? "확정한 헤어·컬러·메이크업·패션을 한곳에 모았습니다." : "지금까지 확인된 상담 결과를 한곳에 모았습니다.",
    rationale: snapshot.result.rationale.slice(0, 3),
    effects: selected ? [selected.reason] : [],
    avoid: [],
    cautions: snapshot.result.limitations.slice(0, 3),
    detailHref: null,
    payload: {
      heroImage: heroSrc ? reportImage("report-v2-hero", heroSrc, "최종 헤어와 컬러 결과", "확정 헤어와 컬러") : null,
      outcomes,
      changeIntensity: consultationChangeIntensityLabel(snapshot.discovery.changeLevel),
      maintenanceDifficulty: consultationMaintenanceLabel(snapshot.discovery.maintenanceLevel),
      salonRequired: Boolean(selected?.services.length || snapshot.colorDecision.state === "confirmed"),
    },
  });

  if (source.salonBrief || snapshot.salonBrief.createdAt) {
    const brief = source.salonBrief;
    const services = brief?.details.services ?? {
      cut: snapshot.salonBrief.cut ? [snapshot.salonBrief.cut] : [],
      perm: [],
      color: snapshot.colorDecision.state === "confirmed" ? [snapshot.colorDecision.colorName] : [],
    };
    const design = brief
      ? [
          ["기장", brief.details.design.length],
          ["볼륨", brief.details.design.volume],
          ["앞머리·가르마", brief.details.design.fringeParting],
          ["질감", brief.details.design.texture],
        ]
      : [
          ["커트", snapshot.salonBrief.cut],
          ["볼륨·질감", snapshot.salonBrief.volumeTexture],
        ];
    sections.push({
      key: "salon-specification",
      tab: "final",
      title: "살롱 시술 명세",
      kicker: "디자이너에게 보여줄 내용",
      status: brief || snapshot.salonBrief.createdAt ? "ready" : "partial",
      conclusion: brief?.summary || snapshot.salonBrief.summary || "확정 결과를 살롱 전달용으로 정리했습니다.",
      rationale: brief?.details.evidence ?? snapshot.result.rationale,
      effects: brief?.details.decisionRationale ?? [],
      avoid: [],
      cautions: brief?.cautions ?? snapshot.salonBrief.caution,
      detailHref: stageHref(snapshot.sessionId, "salon-brief"),
      payload: {
        customerSummary: brief?.summary || snapshot.salonBrief.summary,
        version: brief?.version ?? snapshot.salonBrief.version,
        services,
        design: design.filter((item) => item[1]?.trim()).map(([label, value]) => ({ label, value })),
        styling: brief?.styling ?? (snapshot.salonBrief.styling ? [snapshot.salonBrief.styling] : []),
        cautions: brief?.cautions ?? snapshot.salonBrief.caution,
        unresolved: brief?.details.unresolved ?? [],
      },
    });
  }

  const initialCare = buildInitialCare(snapshot);
  if (initialCare) sections.push(initialCare);

  const tabs = CONSULTATION_REPORT_TAB_ORDER_V2.map((key) => ({
    key,
    label: TAB_LABELS[key],
    sections: sections.filter((item) => item.tab === key),
  })).filter((tab) => tab.key === "final" || tab.sections.length > 0);
  const filteredTabs =
    profile === "salon_handoff"
      ? tabs
          .map((tab) => ({
            ...tab,
            sections: tab.sections.filter((item) => ["final-hair", "final-color", "salon-specification", "initial-care", "executive-summary"].includes(item.key)),
          }))
          .filter((tab) => tab.key === "final" || tab.sections.length > 0)
      : tabs;
  const provenance = buildProvenance(snapshot, source);
  const sourceFingerprint = provenance.fingerprint;
  return {
    schemaVersion: "consultation-report-view-model-v2",
    reportId: snapshot.result.id ?? `preview-${snapshot.sessionId}`,
    consultationId: snapshot.sessionId,
    consultationVersion: snapshot.version,
    resultVersion: Math.max(1, snapshot.result.version),
    viewModelVersion: 2,
    rendererVersion: "report-pdf-v2",
    profile,
    generatedAt: snapshot.result.compiledAt ?? snapshot.updatedAt,
    refreshedAt: snapshot.updatedAt,
    headline: snapshot.result.headline || "HairFit AI 컨설팅 결과",
    status: snapshot.result.state === "attention-required" || !selected ? "partial" : "ready",
    defaultTab: "final",
    tabs: filteredTabs,
    sourceFingerprint,
    provenance,
    integrityCode: `${sourceFingerprint}-${snapshot.version.toString(16).padStart(4, "0")}`,
    rawPhotoIncluded: false,
    afterPhotoIncluded: false,
    limitations: snapshot.result.limitations,
  };
}
