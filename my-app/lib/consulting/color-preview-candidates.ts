import type { ConsultationSnapshot } from "./contracts";

export type HairColorCandidateKey = "best-match" | "natural" | "accent";

export interface HairColorPreviewCandidate {
  key: HairColorCandidateKey;
  name: string;
  salonName: string;
  swatchHex: string;
  technique: "full" | "root" | "highlight" | "balayage" | "ombre";
  targetLevel: number | null;
  intensity: number;
  temperature: number;
  saturation: number;
  rootDepth: number;
  rationale: string[];
  bleachPolicy: string;
  maintenance: string;
  cautions: string[];
}

type CandidateSource = Pick<ConsultationSnapshot, "discovery" | "personalColorDiagnosis">;

const FALLBACKS: Record<HairColorCandidateKey, { name: string; hex: string; level: number; intensity: number }> = {
  "best-match": { name: "딥 초콜릿 브라운", hex: "#4D3426", level: 5, intensity: 72 },
  natural: { name: "내추럴 카카오 브라운", hex: "#5B4033", level: 4, intensity: 58 },
  accent: { name: "소프트 카멜 브라운", hex: "#9A765B", level: 7, intensity: 66 },
};

function validHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function targetPolicy(level: number, damageLevel: string) {
  if (level >= 8) {
    return damageLevel === "높음"
      ? "고명도 탈색 보류 · 모발 탄력과 이력 대면 진단 필수"
      : "단계적 탈색 후 언더톤 중화 · 현장 모발 진단 필수";
  }
  if (level >= 6) return "현재 베이스에 따라 약한 리프트 또는 탈염 후 톤 보정";
  return "탈색 없이 색소 보정 우선 · 잔존 색소에 따라 현장 조정";
}

function maintenanceText(level: number, requested: string | undefined) {
  if (requested) return requested;
  if (level >= 8) return "3~5주 토닝 · 열기구 전용 보호제와 집중 손상 케어";
  if (level >= 6) return "4~6주 컬러 케어 · 퇴색 시 토닝";
  return "6~8주 컬러 케어 · 뿌리 경계 확인";
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export function compileHairColorPreviewCandidates(source: CandidateSource): HairColorPreviewCandidate[] {
  const diagnosis = source.personalColorDiagnosis;
  const directions = diagnosis.hairColorDirections;
  const hints = diagnosis.hairColorHints;
  const bestColors = diagnosis.bestColors;
  const palette = diagnosis.palette;
  const damageLevel = source.discovery.damageLevel;
  const lowMaintenance = source.discovery.maintenanceLevel === "low";
  const temperature = diagnosis.axes.temperature === null ? 0 : Math.round((diagnosis.axes.temperature - 0.5) * 40);
  const primaryLabel = diagnosis.primaryType?.replaceAll("_", " ") || "퍼스널 컬러";

  return (["best-match", "natural", "accent"] as const).map((key, index) => {
    const fallback = FALLBACKS[key];
    const direction = directions[index] || (key === "best-match" ? directions[0] : undefined);
    const paletteSource = key === "natural"
      ? palette.neutrals[0] || palette.best[0]
      : key === "accent"
        ? palette.accents[0] || palette.best[1]
        : palette.best[0];
    const swatch = bestColors[index] || bestColors[0];
    const level = Math.max(1, Math.min(10, direction?.targetLevel ?? (lowMaintenance && key === "accent" ? 6 : fallback.level)));
    const name = direction?.name || hints[index] || (key === "best-match" ? hints[0] : undefined) || swatch?.nameKo || fallback.name;
    const technique = key === "accent" ? (damageLevel === "높음" ? "highlight" : "balayage") : "full";
    const cautions = unique([
      damageLevel === "높음" ? "손상도가 높아 실제 시술 전 모발 탄력과 이전 시술 이력을 확인해야 합니다." : null,
      level >= 8 ? "밝은 명도는 한 번의 시술로 구현되지 않을 수 있습니다." : null,
      diagnosis.warnings[0],
    ]);
    return {
      key,
      name: key === "best-match" ? "베스트 매치" : key === "natural" ? "내추럴" : "액센트",
      salonName: name,
      swatchHex: validHex(swatch?.hex || paletteSource, fallback.hex),
      technique,
      targetLevel: level,
      intensity: fallback.intensity,
      temperature,
      saturation: key === "natural" ? -8 : key === "accent" ? 12 : 0,
      rootDepth: key === "accent" ? 30 : 20,
      rationale: unique([
        direction?.reason,
        swatch?.recommendationReason,
        `${primaryLabel}의 온도·명도·채도·대비 축을 확정 헤어에 연결한 후보입니다.`,
        key === "natural" ? "현재 모발과의 차이를 줄여 일상 관리 부담을 낮춥니다." : null,
        key === "accent" ? "얼굴 가까이 퍼스널 컬러 포인트가 보이도록 입체적인 기법을 사용합니다." : null,
      ]).slice(0, 3),
      bleachPolicy: direction?.bleachPolicy || targetPolicy(level, damageLevel),
      maintenance: maintenanceText(level, direction?.maintenance),
      cautions,
    } satisfies HairColorPreviewCandidate;
  });
}

export function findHairColorPreviewCandidate(source: CandidateSource, key: HairColorCandidateKey) {
  return compileHairColorPreviewCandidates(source).find((candidate) => candidate.key === key) ?? null;
}
