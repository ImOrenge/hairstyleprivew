import * as SecureStore from "expo-secure-store";

const ACTIVE_CONSULTATION_KEY = "hairfit.v2.active-consultation-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeActiveConsultationId(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}

export async function readActiveV2ConsultationId() {
  return normalizeActiveConsultationId(await SecureStore.getItemAsync(ACTIVE_CONSULTATION_KEY));
}

export async function saveActiveV2ConsultationId(consultationId: string) {
  const normalized = normalizeActiveConsultationId(consultationId);
  if (!normalized) throw new Error("INVALID_V2_CONSULTATION_ID");
  await SecureStore.setItemAsync(ACTIVE_CONSULTATION_KEY, normalized);
  return normalized;
}

export async function clearActiveV2ConsultationId() {
  await SecureStore.deleteItemAsync(ACTIVE_CONSULTATION_KEY);
}
