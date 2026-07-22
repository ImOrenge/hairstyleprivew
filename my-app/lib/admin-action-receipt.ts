export type AdminActionOutcome =
  | "processing"
  | "succeeded"
  | "already_processed"
  | "conflict"
  | "provider_pending"
  | "failed";

export interface AdminActionReceipt {
  id: string;
  action_key: string;
  action_type: "credit_adjustment" | "account_type_change" | "refund_approval";
  actor_user_id: string;
  target_user_id: string | null;
  target_resource_type: string;
  target_resource_id: string;
  status: AdminActionOutcome;
  request_payload: Record<string, unknown>;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  external_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AdminActionResult {
  outcome: AdminActionOutcome;
  replayed: boolean;
  receipt: AdminActionReceipt;
  errorCode?: string;
  ledger?: Record<string, unknown>;
  member?: Record<string, unknown>;
  refundRequest?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdminActionOutcome(value: unknown): value is AdminActionOutcome {
  return [
    "processing",
    "succeeded",
    "already_processed",
    "conflict",
    "provider_pending",
    "failed",
  ].includes(String(value));
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function parseAdminActionResult(value: unknown): AdminActionResult | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate) || !isAdminActionOutcome(candidate.outcome)) {
    return null;
  }

  const receipt = candidate.receipt;
  if (!isRecord(receipt) || typeof receipt.id !== "string" || !isAdminActionOutcome(receipt.status)) {
    return null;
  }

  return candidate as unknown as AdminActionResult;
}

export function adminActionErrorMessage(result: AdminActionResult): string {
  const code = result.errorCode || result.receipt.error_code;
  switch (code) {
    case "action_key_conflict":
      return "같은 작업 식별자가 다른 요청에 사용되었습니다. 창을 닫고 다시 시도해 주세요.";
    case "stale_balance":
      return "확인하는 동안 크레딧 잔액이 변경되었습니다. 최신 값을 확인해 주세요.";
    case "insufficient_credits":
      return "조정 후 잔액이 음수가 되어 적용할 수 없습니다.";
    case "stale_account_type":
      return "확인하는 동안 계정 권한이 변경되었습니다. 최신 값을 확인해 주세요.";
    case "self_role_change_forbidden":
      return "현재 로그인한 관리자의 권한은 이 화면에서 변경할 수 없습니다.";
    case "refund_in_progress":
      return "이 환불 요청은 다른 작업에서 이미 처리 중입니다.";
    case "refund_already_processed":
      return "이 환불 요청은 이미 처리되었습니다.";
    case "stale_refund_state":
      return "확인하는 동안 환불 상태 또는 금액이 변경되었습니다.";
    case "member_not_found":
      return "대상 회원을 찾지 못했습니다.";
    case "refund_request_not_found":
      return "환불 요청을 찾지 못했습니다.";
    default:
      return result.receipt.error_message || "관리자 작업을 완료하지 못했습니다.";
  }
}

export function adminActionHttpStatus(result: AdminActionResult): number {
  if (result.outcome === "conflict") return 409;
  if (result.outcome === "processing" || result.outcome === "provider_pending") return 202;
  if (result.outcome === "failed") {
    const code = result.errorCode || result.receipt.error_code;
    return code?.endsWith("_not_found") ? 404 : 500;
  }
  return 200;
}
