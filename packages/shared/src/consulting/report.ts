import type { ConsultationSnapshot, ConsultationStage } from "./contract.ts";

export type ConsultationReportProfileV1 = "full_journey" | "salon_handoff";
export type ConsultationReportSectionStatus = "ready" | "partial" | "not_started" | "unavailable" | "redacted";

export interface ConsultationReportFieldV1 {
  label: string;
  value: string;
  note?: string;
}

export interface ConsultationReportImageV1 {
  id: string;
  src: string | null;
  alt: string;
  label: string;
  status: "ready" | "pending" | "failed";
}

export interface ConsultationReportSectionV1 {
  key: string;
  number: string;
  kicker: string;
  title: string;
  status: ConsultationReportSectionStatus;
  summary: string;
  sourceStage: ConsultationStage | null;
  detailHref: string | null;
  fields: ConsultationReportFieldV1[];
  bullets: string[];
  images: ConsultationReportImageV1[];
}

export interface ConsultationReportCompletenessV1 {
  ready: number;
  partial: number;
  notStarted: number;
  unavailable: number;
  redacted: number;
}

export interface ConsultationReportViewModelV1 {
  schemaVersion: "consultation-report-view-model-v1";
  reportId: string;
  consultationId: string;
  consultationVersion: number;
  resultVersion: number;
  profile: ConsultationReportProfileV1;
  headline: string;
  status: ConsultationReportSectionStatus;
  generatedAt: string;
  heroImage: ConsultationReportImageV1 | null;
  rationale: string[];
  limitations: string[];
  nextActions: string[];
  sections: ConsultationReportSectionV1[];
  completeness: ConsultationReportCompletenessV1;
  integrityCode: string;
  rawPhotoIncluded: false;
}

const STATUS_LABEL: Record<ConsultationReportSectionStatus, string> = {
  ready: "완료",
  partial: "일부 자료만 포함",
  not_started: "미완료",
  unavailable: "자료를 불러오지 못함",
  redacted: "개인정보 보호를 위해 제외됨",
};

function present(value: string | number | null | undefined, fallback = "입력하지 않음") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function join(values: Array<string | null | undefined>, fallback = "입력하지 않음") {
  const filtered = values.filter((value): value is string => Boolean(value?.trim()));
  return filtered.length ? filtered.join(" · ") : fallback;
}

function stageHref(sessionId: string, stage: ConsultationStage) {
  return `/consulting/${encodeURIComponent(sessionId)}/${stage}`;
}

function section(input: Omit<ConsultationReportSectionV1, "detailHref"> & { detailHref?: string | null }): ConsultationReportSectionV1 {
  return { ...input, detailHref: input.detailHref ?? null };
}

function shortIntegrityCode(snapshot: ConsultationSnapshot) {
  const source = `${snapshot.sessionId}|${snapshot.version}|${snapshot.result.id ?? "draft"}|${snapshot.result.version}|${snapshot.result.compiledAt ?? snapshot.updatedAt}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}-${snapshot.version.toString(16).padStart(4, "0")}`;
}

function statusCount(sections: ConsultationReportSectionV1[]): ConsultationReportCompletenessV1 {
  return sections.reduce<ConsultationReportCompletenessV1>((counts, item) => {
    if (item.status === "ready") counts.ready += 1;
    if (item.status === "partial") counts.partial += 1;
    if (item.status === "not_started") counts.notStarted += 1;
    if (item.status === "unavailable") counts.unavailable += 1;
    if (item.status === "redacted") counts.redacted += 1;
    return counts;
  }, { ready: 0, partial: 0, notStarted: 0, unavailable: 0, redacted: 0 });
}

export function consultationReportStatusLabel(status: ConsultationReportSectionStatus) {
  return STATUS_LABEL[status];
}

export function projectConsultationReportV1(
  snapshot: ConsultationSnapshot,
  profile: ConsultationReportProfileV1 = "full_journey",
): ConsultationReportViewModelV1 {
  const selected = snapshot.selectedStyleHistory.at(-1) ?? null;
  const acceptedPreviews = snapshot.previews.filter((item) => item.status === "accepted");
  const passedQuality = snapshot.photo.quality.filter((item) => item.status === "pass").length;
  const personalColorReady = snapshot.personalColorDiagnosis.state === "ready";
  const personalColorUnavailable = ["retry-required", "unavailable"].includes(snapshot.personalColorDiagnosis.state);
  const colorTerminal = ["confirmed", "keep-current", "deferred", "salon-review", "not-applicable"].includes(snapshot.colorDecision.state);
  const makeupStatus = snapshot.makeupDirection?.status ?? "not-started";
  const makeupReady = ["confirmed", "routine_ready", "brief_ready"].includes(makeupStatus);
  const fashionReady = Boolean(snapshot.fashion.lookId && snapshot.fashion.selectedAt && !snapshot.fashion.staleReason);
  const aftercareReady = Boolean(snapshot.actualService.confirmedAt && snapshot.careProgram.actualServiceId);

  const sections: ConsultationReportSectionV1[] = [
    section({
      key: "identity", number: "00", kicker: "DOCUMENT", title: "상담 결과 식별",
      status: snapshot.result.compiledAt ? "ready" : "partial", summary: "이 결과가 어떤 상담 버전과 선택을 기준으로 만들어졌는지 표시합니다.", sourceStage: "result",
      detailHref: stageHref(snapshot.sessionId, "result"), bullets: [], images: [],
      fields: [
        { label: "상담 버전", value: `v${snapshot.version}` },
        { label: "결과 버전", value: `v${Math.max(1, snapshot.result.version)}` },
        { label: "결과 상태", value: snapshot.result.state },
        { label: "컴파일 시각", value: present(snapshot.result.compiledAt, "현재 화면 projection") },
      ],
    }),
    section({
      key: "request", number: "01", kicker: "DISCOVERY", title: "요청 명세",
      status: snapshot.discovery.goals.length || snapshot.discovery.currentHair ? "ready" : "not_started", summary: "처음 상담에서 정한 목표와 현실적인 관리 조건입니다.", sourceStage: "discovery",
      detailHref: stageHref(snapshot.sessionId, "discovery"), images: [],
      fields: [
        { label: "상담 목적", value: present(snapshot.discovery.purpose) },
        { label: "원하는 변화", value: join(snapshot.discovery.goals) },
        { label: "현재 모발", value: join([snapshot.discovery.currentHair, snapshot.discovery.hairLength, snapshot.discovery.hairTexture]) },
        { label: "허용 시술", value: join(snapshot.discovery.allowedServices) },
        { label: "관리 조건", value: `${snapshot.discovery.morningMinutes}분 · ${snapshot.discovery.maintenanceLevel} · ${snapshot.discovery.salonCycleWeeks}주 주기` },
        { label: "피하고 싶은 결과", value: join(snapshot.discovery.avoid) },
      ], bullets: snapshot.discovery.notes ? [`사용자 메모: ${snapshot.discovery.notes}`] : [],
    }),
    section({
      key: "input-quality", number: "02", kicker: "PHOTO / SCAN", title: "입력 품질",
      status: snapshot.photo.quality.length === 0 ? "not_started" : passedQuality === snapshot.photo.quality.length ? "ready" : "partial",
      summary: "AI 분석 전에 시스템이 확인한 촬영 조건과 사용 범위입니다.", sourceStage: "photo", detailHref: stageHref(snapshot.sessionId, "photo"), images: [],
      fields: [
        { label: "품질 검사", value: `${passedQuality}/${snapshot.photo.quality.length} 통과` },
        { label: "분석 근거", value: `${snapshot.evidence.items.length}개 · ${snapshot.evidence.pipelineStatus}` },
        { label: "사용 범위", value: join(snapshot.photo.usageScopes) },
        { label: "보존 기간", value: `${snapshot.photo.retentionDays}일` },
      ],
      bullets: snapshot.photo.quality.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.message}`),
    }),
    section({
      key: "analysis", number: "03", kicker: "ANALYSIS EVIDENCE", title: "얼굴·모발 분석 근거",
      status: snapshot.evidence.items.length ? "ready" : "not_started", summary: "관찰 근거가 어떤 의미와 헤어 방향으로 연결됐는지 보여줍니다.", sourceStage: "analysis",
      detailHref: stageHref(snapshot.sessionId, "analysis"), images: [],
      fields: [
        { label: "얼굴형", value: present(snapshot.faceAnalysis.faceShape) },
        { label: "균형", value: present(snapshot.faceAnalysis.balance) },
        { label: "헤어라인", value: present(snapshot.faceAnalysis.hairline) },
        { label: "모량", value: present(snapshot.faceAnalysis.density) },
        { label: "분석 신뢰도", value: snapshot.faceAnalysis.confidence },
      ],
      bullets: snapshot.evidence.items.map((item) => `${item.evidence} → ${item.meaning} → ${item.action}${item.manuallyCorrected ? " · 사용자 교정" : ""}`),
    }),
    section({
      key: "personal-color", number: "04", kicker: "PERSONAL COLOR", title: "퍼스널 컬러 진단",
      status: personalColorReady ? "ready" : personalColorUnavailable ? "unavailable" : snapshot.personalColorDiagnosis.state === "deferred" ? "partial" : "not_started",
      summary: snapshot.personalColorDiagnosis.summary || "촬영 조건과 피부색 근거를 이용한 컬러 선택 가이드입니다.", sourceStage: "personal-color",
      detailHref: stageHref(snapshot.sessionId, "personal-color"), images: [],
      fields: [
        { label: "1순위", value: present(snapshot.personalColorDiagnosis.primaryType, snapshot.personalColorDiagnosis.state) },
        { label: "2순위", value: present(snapshot.personalColorDiagnosis.secondaryType) },
        { label: "품질", value: `${snapshot.personalColorDiagnosis.qualityStatus}${snapshot.personalColorDiagnosis.qualityConfidence === null ? "" : ` · ${Math.round(snapshot.personalColorDiagnosis.qualityConfidence * 100)}%`}` },
        { label: "4축", value: Object.entries(snapshot.personalColorDiagnosis.axes).map(([key, value]) => `${key} ${value === null ? "미확인" : Math.round(value * 100)}`).join(" · ") },
        { label: "추천 팔레트", value: join(snapshot.personalColorDiagnosis.palette.best) },
        { label: "헤어 컬러 방향", value: join(snapshot.personalColorDiagnosis.hairColorHints) },
      ], bullets: snapshot.personalColorDiagnosis.warnings,
    }),
    section({
      key: "direction", number: "05", kicker: "DIRECTION", title: "헤어 디자인 방향",
      status: snapshot.strategy.confirmedAt ? "ready" : "partial", summary: "생성 전에 확정한 8개 헤어 설계 축입니다.", sourceStage: "direction",
      detailHref: stageHref(snapshot.sessionId, "direction"), images: [], bullets: snapshot.strategyRecommendations.map((item) => `${item.axis}: ${item.reason} · ${item.impact}`),
      fields: [
        { label: "기장", value: snapshot.strategy.length }, { label: "앞머리", value: snapshot.strategy.fringe },
        { label: "가르마", value: snapshot.strategy.parting }, { label: "레이어", value: snapshot.strategy.layerStart },
        { label: "정수리 볼륨", value: snapshot.strategy.crownVolume }, { label: "측면 볼륨", value: snapshot.strategy.sideVolume },
        { label: "질감", value: snapshot.strategy.texture }, { label: "컬러", value: snapshot.strategy.color },
      ],
    }),
    section({
      key: "preview-comparison", number: "06", kicker: "PREVIEW / COMPARE", title: "후보 생성과 비교",
      status: acceptedPreviews.length >= 9 ? "ready" : acceptedPreviews.length ? "partial" : "not_started", summary: "서로 다른 전략 후보와 shortlist·finalist 결정 기록입니다.", sourceStage: "previews",
      detailHref: stageHref(snapshot.sessionId, "previews"),
      fields: [
        { label: "품질 승인", value: `${acceptedPreviews.length}/9` },
        { label: "Shortlist", value: join(snapshot.shortlist.previewIds) },
        { label: "Finalist", value: present(snapshot.finalist.finalistPreviewId) },
        { label: "Backup", value: present(snapshot.finalist.backupPreviewId) },
      ], bullets: snapshot.previews.filter((item) => item.status === "failed").map((item) => `${item.label}: 생성 실패`),
      images: acceptedPreviews.slice(0, profile === "salon_handoff" ? 3 : 9).map((item) => ({ id: item.id, src: item.imageUrl, alt: `${item.label} 헤어 프리뷰`, label: `${item.axis} · ${item.label}`, status: item.imageUrl ? "ready" : "pending" })),
    }),
    section({
      key: "decision", number: "07", kicker: "DECISION", title: "최종 헤어 결정",
      status: selected ? "ready" : "not_started", summary: selected?.reason || "확정된 헤어스타일이 없습니다.", sourceStage: "decision",
      detailHref: stageHref(snapshot.sessionId, "decision"),
      fields: [
        { label: "선택 스타일", value: present(selected?.label) },
        { label: "구현 가능성", value: present(selected?.feasibility) },
        { label: "현재 모발과 차이", value: present(selected?.currentHairGap) },
        { label: "필요 시술", value: join(selected?.services ?? []) },
        { label: "관리", value: present(selected?.maintenance) },
      ], bullets: selected?.limitations ?? [], images: selected ? [{ id: selected.id, src: selected.imageUrl, alt: `${selected.label} 확정 헤어`, label: "확정 헤어", status: selected.imageUrl ? "ready" : "pending" }] : [],
    }),
    section({
      key: "color-studio", number: "08", kicker: "COLOR STUDIO", title: "염색 컬러 확정",
      status: colorTerminal ? "ready" : snapshot.colorDecision.state === "editing" || snapshot.colorDecision.state === "generating" ? "partial" : "not_started",
      summary: snapshot.colorDecision.state === "confirmed" ? `${snapshot.colorDecision.colorName} 컬러를 확정했습니다.` : "현재 컬러 유지·보류·살롱 검토 상태도 결과로 기록합니다.", sourceStage: "color-studio",
      detailHref: stageHref(snapshot.sessionId, "color-studio"),
      fields: [
        { label: "결정", value: snapshot.colorDecision.state }, { label: "컬러", value: present(snapshot.colorDecision.colorName) },
        { label: "기법", value: snapshot.colorDecision.technique }, { label: "목표 레벨", value: present(snapshot.colorDecision.targetLevel) },
        { label: "탈색", value: present(snapshot.colorDecision.bleachPolicy) }, { label: "유지", value: present(snapshot.colorDecision.maintenance) },
        { label: "퇴색 방향", value: present(snapshot.colorDecision.fadeDirection) },
      ], bullets: snapshot.colorDecision.warnings,
      images: snapshot.colorDecision.finalImageUrl ? [{ id: snapshot.colorDecision.id ?? "color-final", src: snapshot.colorDecision.finalImageUrl, alt: `${snapshot.colorDecision.colorName} 최종 염색 프리뷰`, label: "확정 컬러", status: "ready" }] : [],
    }),
    section({
      key: "salon-brief", number: "09", kicker: "SALON BRIEF", title: "살롱 전달 명세",
      status: snapshot.salonBrief.createdAt ? "ready" : "not_started", summary: snapshot.salonBrief.summary || "Salon Brief를 준비하지 않았습니다.", sourceStage: "salon-brief",
      detailHref: stageHref(snapshot.sessionId, "salon-brief"), images: [],
      fields: [
        { label: "버전", value: `v${snapshot.salonBrief.version}` }, { label: "커트", value: present(snapshot.salonBrief.cut) },
        { label: "볼륨·질감", value: present(snapshot.salonBrief.volumeTexture) }, { label: "스타일링", value: present(snapshot.salonBrief.styling) },
      ], bullets: snapshot.salonBrief.caution,
    }),
    section({
      key: "makeup", number: "10", kicker: "MAKEUP", title: "메이크업 디렉팅",
      status: makeupReady ? "ready" : makeupStatus === "not-started" ? "not_started" : makeupStatus === "failed_retryable" ? "unavailable" : "partial",
      summary: "퍼스널 컬러와 확정 헤어를 기준으로 만든 7개 메이크업 모듈·루틴·아티스트 브리프입니다.", sourceStage: "makeup",
      detailHref: stageHref(snapshot.sessionId, "makeup"), images: [], bullets: [],
      fields: [
        { label: "상태", value: makeupStatus }, { label: "확정 시각", value: present(snapshot.makeupDirection?.confirmedAt) },
        { label: "Routine", value: makeupStatus === "routine_ready" || makeupStatus === "brief_ready" ? "준비됨" : "상세 화면에서 확인" },
        { label: "Artist brief", value: makeupStatus === "brief_ready" ? "준비됨" : "상세 화면에서 확인" },
      ],
    }),
    section({
      key: "fashion", number: "11", kicker: "FASHION", title: "패션 최종 룩",
      status: fashionReady ? "ready" : snapshot.fashion.direction ? "partial" : "not_started", summary: snapshot.fashion.direction || "패션 방향을 아직 정하지 않았습니다.", sourceStage: "fashion",
      detailHref: stageHref(snapshot.sessionId, "fashion"), images: [],
      fields: [
        { label: "최종 룩", value: present(snapshot.fashion.label) }, { label: "카테고리", value: present(snapshot.fashion.category) },
        { label: "팔레트", value: join(snapshot.fashion.palette) }, { label: "실루엣", value: present(snapshot.fashion.silhouette) },
        { label: "네크라인", value: present(snapshot.fashion.neckline) }, { label: "쇼핑 키워드", value: join(snapshot.fashion.shoppingKeywords) },
      ], bullets: snapshot.fashion.avoidCombinations.map((item) => `피할 조합: ${item}`),
    }),
    section({
      key: "aftercare", number: "12", kicker: "AFTERCARE", title: "실제 시술·관리 상태",
      status: aftercareReady ? "ready" : snapshot.actualService.confirmedAt ? "partial" : "not_started",
      summary: aftercareReady ? "실제 시술을 기준으로 관리 프로그램이 연결됐습니다." : "Result 완료와 별개로 실제 시술 기록 후 활성화됩니다.", sourceStage: "aftercare",
      detailHref: stageHref(snapshot.sessionId, "aftercare"), images: [],
      fields: [
        { label: "실제 시술", value: join(snapshot.actualService.services, "시술 전") }, { label: "시술일", value: present(snapshot.actualService.serviceDate, "시술 전") },
        { label: "오늘 관리", value: join(snapshot.careProgram.today, "프로그램 미활성") },
        { label: "체크포인트", value: snapshot.careProgram.checkpoints.map((item) => `${item.offset} ${item.complete ? "완료" : "예정"}`).join(" · ") || "프로그램 미활성" },
      ], bullets: snapshot.careProgram.concerns,
    }),
    section({
      key: "integrity", number: "13", kicker: "NOTICE / INTEGRITY", title: "고지와 무결성",
      status: "ready", summary: "이 문서는 상담 당시의 선택과 근거를 재현하며 의료 진단이나 실제 시술 결과를 보증하지 않습니다.", sourceStage: null,
      fields: [
        { label: "무결성 코드", value: shortIntegrityCode(snapshot) },
        { label: "원본 얼굴 사진", value: "개인정보 보호를 위해 제외됨" },
        { label: "상담/결과 버전", value: `v${snapshot.version} / v${Math.max(1, snapshot.result.version)}` },
        { label: "마지막 동기화", value: snapshot.updatedAt },
      ], bullets: ["AI 분석 결과는 의료 진단이 아니며 디자이너의 현장 판단이 우선합니다.", "실제 모발 길이·모량·손상도와 시술 방식에 따라 결과가 달라질 수 있습니다."], images: [],
    }),
  ];

  const filteredSections = profile === "salon_handoff"
    ? sections.filter((item) => ["identity", "request", "analysis", "decision", "color-studio", "salon-brief", "integrity"].includes(item.key))
    : sections;
  const completeness = statusCount(filteredSections);
  const heroSrc = snapshot.result.heroImageUrl || snapshot.colorDecision.finalImageUrl || selected?.imageUrl || null;
  const reportStatus: ConsultationReportSectionStatus = snapshot.result.state === "attention-required" ? "partial" : snapshot.result.compiledAt ? "ready" : "partial";

  return {
    schemaVersion: "consultation-report-view-model-v1",
    reportId: snapshot.result.id ?? `preview-${snapshot.sessionId}`,
    consultationId: snapshot.sessionId,
    consultationVersion: snapshot.version,
    resultVersion: Math.max(1, snapshot.result.version),
    profile,
    headline: snapshot.result.headline || (selected ? `${selected.label}을 중심으로 정리한 AI 컨설팅` : "AI 컨설팅 결과를 정리하고 있습니다"),
    status: reportStatus,
    generatedAt: snapshot.result.compiledAt ?? snapshot.updatedAt,
    heroImage: heroSrc ? { id: "report-hero", src: heroSrc, alt: "최종 컨설팅 대표 이미지", label: "최종 선택", status: "ready" } : null,
    rationale: snapshot.result.rationale,
    limitations: snapshot.result.limitations,
    nextActions: snapshot.result.nextActions,
    sections: filteredSections,
    completeness,
    integrityCode: shortIntegrityCode(snapshot),
    rawPhotoIncluded: false,
  };
}
