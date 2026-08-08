export function isConsultationFrontendEnabled() {
  return process.env.NEXT_PUBLIC_CONSULTATION_FRONTEND_V2 === "true";
}
