import { MAKEUP_MODULES, type MakeupContextProfile, type MakeupModuleDirection } from "./contract.ts";
import { MAKEUP_MODE_LABELS, type MakeupInterviewProfileV2, type MakeupMode, type MakeupRecommendationRationaleV1 } from "./interview.ts";

const MODULE_LABELS: Record<(typeof MAKEUP_MODULES)[number], string> = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "블러셔", lip: "립", lashes: "속눈썹" };

function suggestedMode(profile: MakeupInterviewProfileV2): MakeupMode {
  const constrained = profile.preparationMinutes <= 5 || profile.skillLevel === "none";
  if (constrained && ["full_definition", "glam_event", "fashion_editorial"].includes(profile.primaryMode)) return "soft_blend";
  if (profile.preparationMinutes <= 10 && profile.primaryMode === "fashion_editorial") return "full_definition";
  return profile.primaryMode;
}

export function compileMakeupRecommendationRationaleV1(input: {
  profile: MakeupInterviewProfileV2;
  source: { faceObservationBundleId: string; personalColorProfileId: string; selectedStyleId: string; inputProfileRevision: number };
  personalColor: { label: string; confidence: number; palette: string[] };
  face: { quality: string; validSkinPixelRatio: number; warnings: string[] };
  hair: { colorFamily: string | null; fringe: string | null; parting: string | null };
  modules?: MakeupModuleDirection[];
}): MakeupRecommendationRationaleV1 {
  const suggested = suggestedMode(input.profile);
  const adjustmentRequired = suggested !== input.profile.primaryMode;
  const evidence = [
    { id: "intent", source: "user" as const, sourceId: `makeup-interview:${input.profile.revision}`, label: "희망 방향", finding: MAKEUP_MODE_LABELS[input.profile.primaryMode], impact: `${input.profile.primaryOccasion} 상황의 우선 인상으로 반영합니다.` },
    { id: "personal-color", source: "personal_color" as const, sourceId: input.source.personalColorProfileId, label: "퍼스널 컬러", finding: `${input.personalColor.label} · ${input.personalColor.palette.slice(0, 3).join(" · ")}`, impact: "베이스·아이·치크·립의 온도와 채도를 맞춥니다." },
    { id: "face-observation", source: "face_observation" as const, sourceId: input.source.faceObservationBundleId, label: "얼굴 관측", finding: `${input.face.quality} · 유효 피부 관측 ${Math.round(input.face.validSkinPixelRatio * 100)}%`, impact: "얼굴 구조와 관측 가능한 부위 안에서 위치 가이드를 제한합니다." },
    { id: "confirmed-hair", source: "confirmed_hair" as const, sourceId: input.source.selectedStyleId, label: "확정 헤어", finding: [input.hair.colorFamily, input.hair.fringe, input.hair.parting].filter(Boolean).join(" · ") || "확정 스타일", impact: "눈썹·아이라인·립 대비가 헤어와 분리되지 않도록 연결합니다." },
    { id: "practicality", source: "practical_constraint" as const, sourceId: `input-profile:${input.source.inputProfileRevision}`, label: "현실 제약", finding: `${input.profile.preparationMinutes}분 · ${input.profile.skillLevel}`, impact: adjustmentRequired ? `${MAKEUP_MODE_LABELS[suggested]} 수준으로 단계를 압축해 제안합니다.` : "선택한 표현을 유지할 수 있는 복잡도로 구성합니다." },
  ];
  const moduleDirections = input.modules ?? [];
  const modules = MAKEUP_MODULES.map((module) => {
    const direction = moduleDirections.find((item) => item.module === module)?.direction;
    const reasonCodes = [`mode:${suggested}`, `occasion:${input.profile.primaryOccasion}`, `finish:${input.profile.finishPreference}`, `time:${input.profile.preparationMinutes}`, `skill:${input.profile.skillLevel}`];
    return { module, evidenceIds: ["intent", "personal-color", "face-observation", "confirmed-hair", "practicality"], reasonCodes, summary: `${MODULE_LABELS[module]}은 ${direction?.colorFamily ?? "퍼스널 컬러 팔레트"} 계열과 ${direction?.texture ?? input.profile.finishPreference} 질감으로 연결합니다.` };
  });
  const tradeoffs = adjustmentRequired ? [`${MAKEUP_MODE_LABELS[input.profile.primaryMode]}의 인상은 유지하되 ${input.profile.preparationMinutes}분과 ${input.profile.skillLevel} 숙련도에 맞춰 ${MAKEUP_MODE_LABELS[suggested]}로 압축합니다.`] : ["사용자가 선택한 대표 모드를 그대로 유지합니다."];
  if (input.profile.exclusions.length) tradeoffs.push(`회피 조건을 우선합니다: ${input.profile.exclusions.join(", ")}`);
  return {
    schemaVersion: "makeup-recommendation-rationale-v1",
    revision: input.profile.revision,
    requestedMode: input.profile.primaryMode,
    suggestedMode: suggested,
    acceptedMode: null,
    decision: "pending",
    adjustmentRequired,
    alternativeMode: suggested === "daily_natural" ? "soft_blend" : "daily_natural",
    evidence,
    modules,
    tradeoffs,
    limitations: ["사진 조명과 화면 색상에 따라 실제 발색이 다를 수 있습니다.", ...input.face.warnings.slice(0, 2)],
    confidence: Math.max(0, Math.min(1, Math.round((input.personalColor.confidence * 0.65 + input.face.validSkinPixelRatio * 0.35) * 100) / 100)),
    deterministicSummary: [
      `${MAKEUP_MODE_LABELS[input.profile.primaryMode]} 요청을 ${input.personalColor.label}과 확정 헤어에 맞춰 정리했습니다.`,
      adjustmentRequired ? `${MAKEUP_MODE_LABELS[suggested]} 조정안을 검토해 주세요.` : "선택한 방향을 그대로 추천합니다.",
    ],
  };
}

export function rationaleContext(rationale: MakeupRecommendationRationaleV1, profile: MakeupInterviewProfileV2): MakeupContextProfile["presentation"] {
  const mode = rationale.acceptedMode ?? rationale.requestedMode;
  if (mode === "transparent_correction") return "invisible_correction";
  if (mode === "daily_natural") return "natural_grooming";
  if (mode === "soft_blend") return "defined";
  if (mode === "fashion_editorial") return "editorial";
  return profile.primaryMode === "transparent_correction" ? "invisible_correction" : "expressive";
}
