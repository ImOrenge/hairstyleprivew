import type { MakeupArtistBrief, MakeupDirectionSnapshot, MakeupModule, MakeupRoutine } from "./contract.ts";
import { makeupRoutineInstruction, makeupTechnicalCustomerLabel } from "./presentation.ts";

const ORDER: MakeupModule[] = ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"];
const COMPACT_SECONDS: Record<MakeupModule, number> = {
  base: 70,
  brow: 45,
  eyeshadow: 35,
  eyeliner: 25,
  blush: 25,
  lip: 40,
  lashes: 30,
};
const FULL_SECONDS: Record<MakeupModule, number> = {
  base: 100,
  brow: 70,
  eyeshadow: 90,
  eyeliner: 50,
  blush: 45,
  lip: 60,
  lashes: 55,
};
const TIP: Record<MakeupModule, string> = {
  base: "한 번에 두껍게 덮지 말고 필요한 구역만 얇게 쌓으세요.",
  brow: "앞머리는 옅게 두고 빈 영역만 결 방향으로 채우세요.",
  eyeshadow: "눈을 뜬 상태에서 보이는 범위를 확인한 뒤 경계를 풀어 주세요.",
  eyeliner: "눈꼬리에서 한 번에 길게 빼기보다 중앙부터 짧게 연결하세요.",
  blush: "중앙 색을 더하기 전에 바깥 경계를 먼저 흐리게 정리하세요.",
  lip: "입술 경계 밖으로 번지지 않도록 중앙에서 입꼬리 방향으로 얇게 이동하세요.",
  lashes: "뿌리부터 짧게 들어 올리고 덩어리는 마르기 전에 분리하세요.",
};

const safeTerm = (value: string) =>
  makeupTechnicalCustomerLabel(
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_:+\- ]/g, "")
      .trim(),
  ).slice(0, 80);

export function compileMakeupRoutineV1(input: { id: string; snapshot: MakeupDirectionSnapshot; mode?: "compact" | "full"; createdAt: string }): MakeupRoutine {
  if (!input.snapshot.confirmedAt || !["confirmed", "routine_ready", "brief_ready"].includes(input.snapshot.status)) throw new Error("MAKEUP_DIRECTION_NOT_CONFIRMED");
  const mode = input.mode ?? (input.snapshot.context.preparationMinutes <= 10 ? "compact" : "full");
  const seconds = mode === "compact" ? COMPACT_SECONDS : FULL_SECONDS;
  const enabled = ORDER.flatMap((module) => {
    const item = input.snapshot.modules.find((candidate) => candidate.module === module);
    return item?.state === "enabled" && item.direction.enabled ? [item] : [];
  });
  const budget = input.snapshot.context.preparationMinutes * 60;
  const rawTotal = enabled.reduce((sum, item) => sum + seconds[item.module], 0);
  const scale = rawTotal > budget && rawTotal > 0 ? budget / rawTotal : 1;
  const durations = enabled.map((item) => Math.max(15, Math.floor(seconds[item.module] * scale)));
  const overflow = Math.max(0, durations.reduce((sum, value) => sum + value, 0) - budget);
  if (overflow && durations.length) durations[durations.length - 1] -= overflow;
  const steps = enabled.map((item, index) => {
    const tool = item.direction.technical.productAttributes.find((value) => value.startsWith("owned:"))?.slice(6) ?? input.snapshot.context.ownedToolTypes[0] ?? null;
    const terms = [item.direction.colorFamily ?? "", item.direction.texture ?? "", ...item.direction.technical.productAttributes.map((value) => value.replace(/^(owned|search):/, ""))].map(safeTerm).filter(Boolean);
    return {
      order: index + 1,
      module: item.module,
      instruction: makeupRoutineInstruction(item.module),
      zoneIds: item.direction.technical.placement,
      colorAttribute: item.direction.colorFamily,
      intensity: item.direction.intensity,
      toolType: tool,
      estimatedSeconds: durations[index],
      failurePreventionTips: [TIP[item.module], ...item.direction.technical.warnings],
      productSearchTerms: [...new Set(terms)].slice(0, 8),
    };
  });
  return {
    id: input.id,
    makeupDirectionSnapshotId: input.snapshot.id,
    source: input.snapshot.source,
    rationaleRevision: input.snapshot.rationale?.revision ?? null,
    mode,
    estimatedSeconds: steps.reduce((sum, step) => sum + step.estimatedSeconds, 0),
    steps,
    createdAt: input.createdAt,
  };
}

export function compileMakeupArtistBriefV1(input: { id: string; snapshot: MakeupDirectionSnapshot; createdAt: string }): MakeupArtistBrief {
  if (!input.snapshot.confirmedAt || !["confirmed", "routine_ready", "brief_ready"].includes(input.snapshot.status)) throw new Error("MAKEUP_DIRECTION_NOT_CONFIRMED");
  const moduleSummaries = ORDER.map((module) => input.snapshot.modules.find((item) => item.module === module)!).map((item) => ({
    module: item.module,
    enabled: item.state === "enabled" && item.direction.enabled,
    colorFamily: item.direction.colorFamily,
    intensity: item.direction.intensity,
    finish: item.direction.texture ?? item.direction.technical.finish,
    placement: item.direction.technical.placement,
    applicationDirection: item.direction.technical.applicationDirection,
    technique: item.direction.technical.technique,
    cautions: item.direction.technical.warnings,
  }));
  const enabledCount = moduleSummaries.filter((item) => item.enabled).length;
  return {
    id: input.id,
    makeupDirectionSnapshotId: input.snapshot.id,
    source: input.snapshot.source,
    rationaleRevision: input.snapshot.rationale?.revision ?? null,
    sourcePhotoIncluded: false,
    context: {
      presentation: input.snapshot.context.presentation,
      occasions: input.snapshot.context.occasions,
      preparationMinutes: input.snapshot.context.preparationMinutes,
      skillLevel: input.snapshot.context.skillLevel,
      finishPreference: input.snapshot.context.finishPreference,
      facialHair: input.snapshot.context.facialHair,
    },
    presentationIntensity: Math.max(0, ...moduleSummaries.filter((item) => item.enabled).map((item) => item.intensity)),
    exclusions: input.snapshot.context.exclusions,
    moduleSummaries,
    narrative: [`${input.snapshot.context.presentation} 표현을 기준으로 ${enabledCount}개 존을 사용합니다.`, "좌표는 원본 사진의 정규화 기준이며 현장에서는 얼굴 기준선과 비율로 확인합니다.", "원본 사진은 공유 기본값에 포함하지 않습니다."],
    expiresAt: null,
    revokedAt: null,
    createdAt: input.createdAt,
  };
}
