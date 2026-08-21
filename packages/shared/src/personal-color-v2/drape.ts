import { PERSONAL_COLOR_TYPES_V2, type PersonalColorTypeV2 } from "./contract.ts";

export const PERSONAL_COLOR_DRAPE_RESPONSES_V2 = [
  "left_better", "right_better", "no_meaningful_difference", "unsure",
] as const;
export type PersonalColorDrapeResponseV2 = (typeof PERSONAL_COLOR_DRAPE_RESPONSES_V2)[number];
export type PersonalColorDrapePreferenceV2 = "left" | "right" | "neither" | null;

export interface PersonalColorDrapePairV2 {
  id: string;
  left: { colorId: string; hex: string; label: string; supports: PersonalColorTypeV2[] };
  right: { colorId: string; hex: string; label: string; supports: PersonalColorTypeV2[] };
  discriminates: Array<"temperature" | "value" | "chroma" | "contrast" | "hueCharacter">;
  expectedInformationGain: number;
  renderPolicyVersion: "drape-background-band-v1";
  orderToken: "catalog" | "swapped";
}

export interface PersonalColorDrapeAnswerV2 {
  id: string;
  pairId: string;
  revision: number;
  response: PersonalColorDrapeResponseV2;
  preference: PersonalColorDrapePreferenceV2;
  supersedesResponseId: string | null;
  createdAt: string;
}

export interface PersonalColorDrapeSessionV2 {
  schemaVersion: "personal-color-drape-session-v2";
  id: string;
  consultationId: string;
  personalColorProfileId: string;
  sourceProfileVersion: number;
  status: "active" | "paused" | "sufficient_confidence" | "completed" | "abandoned" | "invalidated";
  revision: number;
  posteriorBefore: Array<{ type: PersonalColorTypeV2; probability: number }>;
  posteriorAfter: Array<{ type: PersonalColorTypeV2; probability: number }>;
  pairs: PersonalColorDrapePairV2[];
  responses: PersonalColorDrapeAnswerV2[];
  harmony: { rankedColorIds: string[]; evidence: Array<{ colorId: string; score: number; sources: string[] }> };
  preference: { likedColorIds: string[]; dislikedColorIds: string[]; preferredContrast: string | null };
  stopReason: "entropy" | "confidence" | "max_pairs" | "user_stop" | null;
  createdAt: string;
  completedAt: string | null;
}

function posteriorIsValid(posterior: PersonalColorDrapeSessionV2["posteriorBefore"]) {
  return posterior.length === PERSONAL_COLOR_TYPES_V2.length
    && new Set(posterior.map((item) => item.type)).size === PERSONAL_COLOR_TYPES_V2.length
    && posterior.every((item) => Number.isFinite(item.probability) && item.probability >= 0 && item.probability <= 1)
    && Math.abs(posterior.reduce((sum, item) => sum + item.probability, 0) - 1) <= 0.000001;
}

export function assertPersonalColorDrapeSessionV2(session: PersonalColorDrapeSessionV2) {
  if (session.schemaVersion !== "personal-color-drape-session-v2" || !session.id || !session.personalColorProfileId
    || !Number.isInteger(session.sourceProfileVersion) || session.sourceProfileVersion < 1
    || !Number.isInteger(session.revision) || session.revision < 0) throw new Error("PERSONAL_COLOR_DRAPE_IDENTITY_INVALID");
  if (!posteriorIsValid(session.posteriorBefore) || !posteriorIsValid(session.posteriorAfter)) throw new Error("PERSONAL_COLOR_DRAPE_POSTERIOR_INVALID");
  if (session.pairs.length < 6 || session.pairs.length > 10 || new Set(session.pairs.map((pair) => pair.id)).size !== session.pairs.length) {
    throw new Error("PERSONAL_COLOR_DRAPE_PAIRS_INVALID");
  }
  if (session.responses.some((answer) => !PERSONAL_COLOR_DRAPE_RESPONSES_V2.includes(answer.response)
    || answer.revision < 1 || !session.pairs.some((pair) => pair.id === answer.pairId))) throw new Error("PERSONAL_COLOR_DRAPE_RESPONSES_INVALID");
}
