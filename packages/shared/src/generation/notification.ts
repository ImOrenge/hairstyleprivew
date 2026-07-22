export const GENERATION_NOTIFICATION_DELIVERY_STATUSES = [
  "pending",
  "sending",
  "retry_wait",
  "sent",
  "skipped",
  "dead_letter",
  "delivery_unknown",
] as const;

export type GenerationNotificationDeliveryStatus =
  (typeof GENERATION_NOTIFICATION_DELIVERY_STATUSES)[number];

export type LegacyGenerationNotificationStatus =
  | "pending"
  | "sending"
  | "sent"
  | "skipped"
  | "failed";

export function mapGenerationNotificationToLegacyStatus(
  status: GenerationNotificationDeliveryStatus,
): LegacyGenerationNotificationStatus {
  if (status === "pending" || status === "sending" || status === "sent" || status === "skipped") {
    return status;
  }
  return "failed";
}
