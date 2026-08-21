import {
  PERSONAL_COLOR_TYPES_V2,
  type PersonalColorTypeV2,
} from "../../packages/shared/src/personal-color-v2/contract.ts";
import type {
  PersonalColorDrapeAnswerV2,
  PersonalColorDrapePairV2,
  PersonalColorDrapeResponseV2,
} from "../../packages/shared/src/personal-color-v2/drape.ts";

type PairSeed = Omit<PersonalColorDrapePairV2, "orderToken">;
const warm: PersonalColorTypeV2[] = ["spring_light", "spring_warm", "spring_bright", "autumn_muted", "autumn_warm", "autumn_deep"];
const cool: PersonalColorTypeV2[] = ["summer_light", "summer_cool", "summer_muted", "winter_bright", "winter_cool", "winter_deep"];
const light: PersonalColorTypeV2[] = ["spring_light", "summer_light", "spring_bright", "summer_cool"];
const deep: PersonalColorTypeV2[] = ["autumn_deep", "winter_deep", "autumn_warm", "winter_cool"];
const vivid: PersonalColorTypeV2[] = ["spring_bright", "winter_bright", "spring_warm", "winter_cool"];
const soft: PersonalColorTypeV2[] = ["summer_muted", "autumn_muted", "spring_light", "summer_light"];
const highContrast: PersonalColorTypeV2[] = ["winter_bright", "winter_cool", "winter_deep", "spring_bright"];
const lowContrast: PersonalColorTypeV2[] = ["spring_light", "summer_light", "summer_muted", "autumn_muted"];

const CATALOG: PairSeed[] = [
  { id: "temperature-ivory-blue", left: { colorId: "warm_ivory", hex: "#F5E6C8", label: "웜 아이보리", supports: warm }, right: { colorId: "cool_blue", hex: "#B9CEE8", label: "쿨 블루", supports: cool }, discriminates: ["temperature"], expectedInformationGain: 0.92, renderPolicyVersion: "drape-background-band-v1" },
  { id: "temperature-coral-rose", left: { colorId: "coral", hex: "#E97863", label: "코랄", supports: warm }, right: { colorId: "cool_rose", hex: "#C85A86", label: "쿨 로즈", supports: cool }, discriminates: ["temperature", "hueCharacter"], expectedInformationGain: 0.89, renderPolicyVersion: "drape-background-band-v1" },
  { id: "value-powder-navy", left: { colorId: "powder_blue", hex: "#D9E6F3", label: "파우더 블루", supports: light }, right: { colorId: "deep_navy", hex: "#172B4D", label: "딥 네이비", supports: deep }, discriminates: ["value", "contrast"], expectedInformationGain: 0.87, renderPolicyVersion: "drape-background-band-v1" },
  { id: "value-oatmeal-espresso", left: { colorId: "oatmeal", hex: "#D8C4A0", label: "오트밀", supports: light }, right: { colorId: "espresso", hex: "#3B2922", label: "에스프레소", supports: deep }, discriminates: ["value"], expectedInformationGain: 0.82, renderPolicyVersion: "drape-background-band-v1" },
  { id: "chroma-clear-muted-green", left: { colorId: "clear_green", hex: "#1EA672", label: "클리어 그린", supports: vivid }, right: { colorId: "muted_sage", hex: "#8A9B86", label: "뮤트 세이지", supports: soft }, discriminates: ["chroma"], expectedInformationGain: 0.86, renderPolicyVersion: "drape-background-band-v1" },
  { id: "chroma-fuchsia-mauve", left: { colorId: "fuchsia", hex: "#D92F87", label: "푸시아", supports: vivid }, right: { colorId: "dusty_mauve", hex: "#9B788C", label: "더스티 모브", supports: soft }, discriminates: ["chroma", "contrast"], expectedInformationGain: 0.83, renderPolicyVersion: "drape-background-band-v1" },
  { id: "contrast-black-gray", left: { colorId: "true_black", hex: "#111111", label: "트루 블랙", supports: highContrast }, right: { colorId: "soft_gray", hex: "#A6A2A3", label: "소프트 그레이", supports: lowContrast }, discriminates: ["contrast"], expectedInformationGain: 0.81, renderPolicyVersion: "drape-background-band-v1" },
  { id: "contrast-white-taupe", left: { colorId: "optic_white", hex: "#FAFAF7", label: "옵틱 화이트", supports: highContrast }, right: { colorId: "soft_taupe", hex: "#9A897D", label: "소프트 토프", supports: lowContrast }, discriminates: ["contrast", "value"], expectedInformationGain: 0.78, renderPolicyVersion: "drape-background-band-v1" },
  { id: "hue-peach-olive", left: { colorId: "peach", hex: "#F2A083", label: "피치", supports: [...warm, "summer_light"] }, right: { colorId: "olive", hex: "#727A3B", label: "올리브", supports: ["autumn_muted", "autumn_warm", "autumn_deep", "summer_muted"] }, discriminates: ["hueCharacter", "temperature"], expectedInformationGain: 0.76, renderPolicyVersion: "drape-background-band-v1" },
  { id: "hue-red-teal", left: { colorId: "clear_red", hex: "#C92535", label: "클리어 레드", supports: ["spring_bright", "winter_bright", "winter_cool"] }, right: { colorId: "deep_teal", hex: "#176B70", label: "딥 틸", supports: ["autumn_deep", "winter_deep", "summer_cool"] }, discriminates: ["hueCharacter", "chroma"], expectedInformationGain: 0.73, renderPolicyVersion: "drape-background-band-v1" },
];

function swapFor(sessionId: string, pairId: string) {
  const score = `${sessionId}:${pairId}`.split("").reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
  return score % 2 === 1;
}

export function buildDrapePairCatalogV2(sessionId: string) {
  return CATALOG.map((pair) => swapFor(sessionId, pair.id)
    ? { ...pair, left: pair.right, right: pair.left, orderToken: "swapped" as const }
    : { ...pair, orderToken: "catalog" as const });
}

function latestAnswers(answers: readonly PersonalColorDrapeAnswerV2[]) {
  const latest = new Map<string, PersonalColorDrapeAnswerV2>();
  for (const answer of answers) {
    const current = latest.get(answer.pairId);
    if (!current || current.revision < answer.revision) latest.set(answer.pairId, answer);
  }
  return latest;
}

function likelihood(type: PersonalColorTypeV2, pair: PersonalColorDrapePairV2, response: PersonalColorDrapeResponseV2) {
  if (response === "unsure") return 1;
  const left = pair.left.supports.includes(type);
  const right = pair.right.supports.includes(type);
  if (response === "no_meaningful_difference") return left === right ? 1.15 : 0.82;
  if (response === "left_better") return left && !right ? 1.75 : right && !left ? 0.62 : 1;
  return right && !left ? 1.75 : left && !right ? 0.62 : 1;
}

export function updateDrapePosteriorV2(
  posteriorBefore: Array<{ type: PersonalColorTypeV2; probability: number }>,
  pairs: PersonalColorDrapePairV2[],
  answers: PersonalColorDrapeAnswerV2[],
) {
  let probabilities = Object.fromEntries(posteriorBefore.map((item) => [item.type, item.probability])) as Record<PersonalColorTypeV2, number>;
  let appliedEvidence = false;
  for (const answer of latestAnswers(answers).values()) {
    const pair = pairs.find((candidate) => candidate.id === answer.pairId);
    if (!pair || answer.response === "unsure") continue;
    appliedEvidence = true;
    const weighted = Object.fromEntries(PERSONAL_COLOR_TYPES_V2.map((type) => [type, probabilities[type] * likelihood(type, pair, answer.response)])) as Record<PersonalColorTypeV2, number>;
    const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
    probabilities = Object.fromEntries(PERSONAL_COLOR_TYPES_V2.map((type) => [type, weighted[type] / total])) as Record<PersonalColorTypeV2, number>;
  }
  if (!appliedEvidence) return posteriorBefore.map((item) => ({ ...item }));
  const rows = PERSONAL_COLOR_TYPES_V2.map((type) => ({ type, probability: probabilities[type] })).sort((a, b) => b.probability - a.probability);
  const rounded = rows.map((item, index) => ({ ...item, probability: index === rows.length - 1
    ? 1 - rows.slice(0, -1).reduce((sum, row) => sum + Math.round(row.probability * 1_000_000) / 1_000_000, 0)
    : Math.round(item.probability * 1_000_000) / 1_000_000 }));
  return rounded;
}

export function posteriorEntropyV2(posterior: Array<{ probability: number }>) {
  const entropy = -posterior.reduce((sum, item) => sum + (item.probability > 0 ? item.probability * Math.log(item.probability) : 0), 0);
  return entropy / Math.log(PERSONAL_COLOR_TYPES_V2.length);
}

export function drapeStopReasonV2(posterior: Array<{ probability: number }>, answers: PersonalColorDrapeAnswerV2[]) {
  const count = latestAnswers(answers).size;
  if (count >= 10) return "max_pairs" as const;
  if (count >= 6 && (posterior[0]?.probability ?? 0) >= 0.6) return "confidence" as const;
  if (count >= 6 && posteriorEntropyV2(posterior) <= 0.72) return "entropy" as const;
  return null;
}

export function nextDrapePairV2(pairs: PersonalColorDrapePairV2[], answers: PersonalColorDrapeAnswerV2[]) {
  const answered = new Set(latestAnswers(answers).keys());
  return pairs.filter((pair) => !answered.has(pair.id)).sort((a, b) => b.expectedInformationGain - a.expectedInformationGain || a.id.localeCompare(b.id))[0] ?? null;
}

export function deriveDrapePreferenceV2(pairs: PersonalColorDrapePairV2[], answers: PersonalColorDrapeAnswerV2[]) {
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const answer of latestAnswers(answers).values()) {
    const pair = pairs.find((candidate) => candidate.id === answer.pairId);
    if (!pair || !answer.preference || answer.preference === "neither") continue;
    const selected = answer.preference === "left" ? pair.left : pair.right;
    const rejected = answer.preference === "left" ? pair.right : pair.left;
    liked.push(selected.colorId); disliked.push(rejected.colorId);
  }
  return { likedColorIds: [...new Set(liked)], dislikedColorIds: [...new Set(disliked)], preferredContrast: null };
}

export function deriveDrapeHarmonyV2(pairs: PersonalColorDrapePairV2[], answers: PersonalColorDrapeAnswerV2[]) {
  const scores = new Map<string, { score: number; sources: string[] }>();
  for (const answer of latestAnswers(answers).values()) {
    const pair = pairs.find((candidate) => candidate.id === answer.pairId);
    if (!pair || !["left_better", "right_better"].includes(answer.response)) continue;
    const color = answer.response === "left_better" ? pair.left : pair.right;
    const current = scores.get(color.colorId) ?? { score: 0, sources: [] };
    current.score += 1; current.sources.push(`drape:${pair.id}`); scores.set(color.colorId, current);
  }
  const evidence = [...scores].map(([colorId, value]) => ({ colorId, ...value })).sort((a, b) => b.score - a.score || a.colorId.localeCompare(b.colorId));
  return { rankedColorIds: evidence.map((item) => item.colorId), evidence };
}
