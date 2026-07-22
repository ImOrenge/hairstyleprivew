import type {
  GenerationNotificationDeliveryStatus,
  LegacyGenerationNotificationStatus,
} from "../generation/notification.ts";

export interface GenerationNotificationFixture {
  name: string;
  status: GenerationNotificationDeliveryStatus;
  expectedLegacyStatus: LegacyGenerationNotificationStatus;
  terminal: boolean;
  automaticResendAllowed: boolean;
}

export const generationNotificationFixtures: GenerationNotificationFixture[] = [
  {
    name: "pending delivery remains queued",
    status: "pending",
    expectedLegacyStatus: "pending",
    terminal: false,
    automaticResendAllowed: true,
  },
  {
    name: "an active delivery remains visible as sending",
    status: "sending",
    expectedLegacyStatus: "sending",
    terminal: false,
    automaticResendAllowed: true,
  },
  {
    name: "retry wait is recoverable but legacy clients receive failed",
    status: "retry_wait",
    expectedLegacyStatus: "failed",
    terminal: false,
    automaticResendAllowed: true,
  },
  {
    name: "sent delivery is terminal",
    status: "sent",
    expectedLegacyStatus: "sent",
    terminal: true,
    automaticResendAllowed: false,
  },
  {
    name: "missing recipient is terminal and skipped",
    status: "skipped",
    expectedLegacyStatus: "skipped",
    terminal: true,
    automaticResendAllowed: false,
  },
  {
    name: "dead letter requires operator review",
    status: "dead_letter",
    expectedLegacyStatus: "failed",
    terminal: true,
    automaticResendAllowed: false,
  },
  {
    name: "unknown delivery is terminal and must never be blindly resent",
    status: "delivery_unknown",
    expectedLegacyStatus: "failed",
    terminal: true,
    automaticResendAllowed: false,
  },
];
