export function isMobileV2ConsultationEnabled() {
  return process.env.EXPO_PUBLIC_MOBILE_V2_ENABLED !== "false";
}
