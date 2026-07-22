import type { SupabaseClient } from "@supabase/supabase-js";

export const GENERATION_NOTIFICATION_OPERATION_STATUSES = [
  "pending",
  "sending",
  "retry_wait",
  "sent",
  "skipped",
  "dead_letter",
  "delivery_unknown",
] as const;

export type GenerationNotificationOperationStatus =
  (typeof GENERATION_NOTIFICATION_OPERATION_STATUSES)[number];

export type GenerationNotificationOperationHealth = "healthy" | "warning" | "critical";

export interface GenerationNotificationOperationAlert {
  code:
    | "delivery_unknown_present"
    | "dead_letter_present"
    | "expired_sending_lease"
    | "retry_overdue"
    | "queue_age_high";
  severity: "warning" | "critical";
  message: string;
  operatorAction: string;
}

export interface GenerationNotificationOperationsSnapshot {
  sampledAt: string;
  health: GenerationNotificationOperationHealth;
  statusCounts: Record<GenerationNotificationOperationStatus, number>;
  dueRetryCount: number;
  expiredSendingCount: number;
  oldestActionable: {
    status: "pending" | "retry_wait";
    createdAt: string;
    availableAt: string;
    ageMinutes: number;
    overdueMinutes: number;
  } | null;
  thresholds: {
    queueAgeWarningMinutes: number;
    retryOverdueWarningMinutes: number;
  };
  alerts: GenerationNotificationOperationAlert[];
}

interface OperationsEvaluationInput {
  sampledAt: string;
  statusCounts: Record<GenerationNotificationOperationStatus, number>;
  dueRetryCount: number;
  expiredSendingCount: number;
  oldestActionable: {
    status: "pending" | "retry_wait";
    createdAt: string;
    availableAt: string;
  } | null;
  queueAgeWarningMinutes?: unknown;
  retryOverdueWarningMinutes?: unknown;
}

interface NotificationOperationsRow {
  status: "pending" | "retry_wait";
  created_at: string;
  available_at: string;
}

const DEFAULT_QUEUE_AGE_WARNING_MINUTES = 15;
const DEFAULT_RETRY_OVERDUE_WARNING_MINUTES = 5;

function nonNegativeInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function positiveMinutes(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function elapsedMinutes(laterIso: string, earlierIso: string) {
  const later = new Date(laterIso).getTime();
  const earlier = new Date(earlierIso).getTime();
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0;
  return Math.max(0, Math.floor((later - earlier) / 60_000));
}

function healthFromAlerts(alerts: GenerationNotificationOperationAlert[]): GenerationNotificationOperationHealth {
  if (alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (alerts.length > 0) return "warning";
  return "healthy";
}

export function evaluateGenerationNotificationOperations(
  input: OperationsEvaluationInput,
): GenerationNotificationOperationsSnapshot {
  const queueAgeWarningMinutes = positiveMinutes(
    input.queueAgeWarningMinutes,
    DEFAULT_QUEUE_AGE_WARNING_MINUTES,
  );
  const retryOverdueWarningMinutes = positiveMinutes(
    input.retryOverdueWarningMinutes,
    DEFAULT_RETRY_OVERDUE_WARNING_MINUTES,
  );
  const deliveryUnknownCount = nonNegativeInteger(input.statusCounts.delivery_unknown);
  const deadLetterCount = nonNegativeInteger(input.statusCounts.dead_letter);
  const expiredSendingCount = nonNegativeInteger(input.expiredSendingCount);
  const dueRetryCount = nonNegativeInteger(input.dueRetryCount);
  const alerts: GenerationNotificationOperationAlert[] = [];

  if (deliveryUnknownCount > 0) {
    alerts.push({
      code: "delivery_unknown_present",
      severity: "critical",
      message: `발송 여부를 확정할 수 없는 이메일 ${deliveryUnknownCount}건이 있습니다.`,
      operatorAction: "Resend 이벤트와 수신함을 대조하기 전에는 자동 또는 수동 재발송하지 마세요.",
    });
  }

  if (deadLetterCount > 0) {
    alerts.push({
      code: "dead_letter_present",
      severity: "critical",
      message: `재시도 한도를 초과한 이메일 ${deadLetterCount}건이 있습니다.`,
      operatorAction: "마지막 오류와 수신자·sender domain 상태를 확인한 뒤 명시적인 복구 기록을 남기세요.",
    });
  }

  if (expiredSendingCount > 0) {
    alerts.push({
      code: "expired_sending_lease",
      severity: "critical",
      message: `만료된 발송 lease ${expiredSendingCount}건이 회수되지 않았습니다.`,
      operatorAction: "5분 drain 실행과 callback secret을 확인하고 동일 consumer의 중복 실행 여부를 점검하세요.",
    });
  }

  const oldestActionable = input.oldestActionable
    ? {
        status: input.oldestActionable.status,
        createdAt: input.oldestActionable.createdAt,
        availableAt: input.oldestActionable.availableAt,
        ageMinutes: elapsedMinutes(input.sampledAt, input.oldestActionable.createdAt),
        overdueMinutes: elapsedMinutes(input.sampledAt, input.oldestActionable.availableAt),
      }
    : null;

  if (
    dueRetryCount > 0 &&
    oldestActionable?.status === "retry_wait" &&
    oldestActionable.overdueMinutes >= retryOverdueWarningMinutes
  ) {
    alerts.push({
      code: "retry_overdue",
      severity: "warning",
      message: `재시도 가능 시각을 ${oldestActionable.overdueMinutes}분 지난 이메일이 있습니다.`,
      operatorAction: "예약 drain과 Workflow cron 최근 실행 시각을 확인하세요.",
    });
  }

  if (oldestActionable && oldestActionable.ageMinutes >= queueAgeWarningMinutes) {
    alerts.push({
      code: "queue_age_high",
      severity: "warning",
      message: `가장 오래된 처리 가능 이메일이 ${oldestActionable.ageMinutes}분 동안 큐에 있습니다.`,
      operatorAction: "큐 처리량, Resend 응답, DB claim lease를 순서대로 확인하세요.",
    });
  }

  return {
    sampledAt: input.sampledAt,
    health: healthFromAlerts(alerts),
    statusCounts: Object.fromEntries(
      GENERATION_NOTIFICATION_OPERATION_STATUSES.map((status) => [
        status,
        nonNegativeInteger(input.statusCounts[status]),
      ]),
    ) as Record<GenerationNotificationOperationStatus, number>,
    dueRetryCount,
    expiredSendingCount,
    oldestActionable,
    thresholds: {
      queueAgeWarningMinutes,
      retryOverdueWarningMinutes,
    },
    alerts,
  };
}

export async function loadGenerationNotificationOperations(
  client: SupabaseClient,
  now = new Date(),
): Promise<GenerationNotificationOperationsSnapshot> {
  const sampledAt = now.toISOString();
  const statusQueries = GENERATION_NOTIFICATION_OPERATION_STATUSES.map((status) =>
    client
      .from("generation_notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("channel", "email")
      .eq("status", status),
  );
  const dueRetryQuery = client
    .from("generation_notification_outbox")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "retry_wait")
    .lte("available_at", sampledAt);
  const expiredSendingQuery = client
    .from("generation_notification_outbox")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "sending")
    .lte("lease_expires_at", sampledAt);
  const oldestActionableQuery = client
    .from("generation_notification_outbox")
    .select("status,created_at,available_at")
    .eq("channel", "email")
    .in("status", ["pending", "retry_wait"])
    .lte("available_at", sampledAt)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<NotificationOperationsRow>();

  const [statusResults, dueRetryResult, expiredSendingResult, oldestActionableResult] = await Promise.all([
    Promise.all(statusQueries),
    dueRetryQuery,
    expiredSendingQuery,
    oldestActionableQuery,
  ]);
  const firstError = [
    ...statusResults.map((result) => result.error),
    dueRetryResult.error,
    expiredSendingResult.error,
    oldestActionableResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const statusCounts = Object.fromEntries(
    GENERATION_NOTIFICATION_OPERATION_STATUSES.map((status, index) => [
      status,
      nonNegativeInteger(statusResults[index]?.count),
    ]),
  ) as Record<GenerationNotificationOperationStatus, number>;
  const oldest = oldestActionableResult.data;

  return evaluateGenerationNotificationOperations({
    sampledAt,
    statusCounts,
    dueRetryCount: nonNegativeInteger(dueRetryResult.count),
    expiredSendingCount: nonNegativeInteger(expiredSendingResult.count),
    oldestActionable: oldest
      ? {
          status: oldest.status,
          createdAt: oldest.created_at,
          availableAt: oldest.available_at,
        }
      : null,
    queueAgeWarningMinutes: process.env.GENERATION_NOTIFICATION_QUEUE_AGE_WARNING_MINUTES,
    retryOverdueWarningMinutes: process.env.GENERATION_NOTIFICATION_RETRY_OVERDUE_WARNING_MINUTES,
  });
}

export function emitGenerationNotificationOperationAlerts(
  snapshot: GenerationNotificationOperationsSnapshot,
) {
  for (const alert of snapshot.alerts) {
    const payload = {
      event: "generation_notification_operation_alert",
      sampledAt: snapshot.sampledAt,
      health: snapshot.health,
      code: alert.code,
      severity: alert.severity,
      message: alert.message,
      operatorAction: alert.operatorAction,
      statusCounts: snapshot.statusCounts,
      dueRetryCount: snapshot.dueRetryCount,
      expiredSendingCount: snapshot.expiredSendingCount,
      oldestActionable: snapshot.oldestActionable,
    };
    if (alert.severity === "critical") console.error(payload);
    else console.warn(payload);
  }
}
