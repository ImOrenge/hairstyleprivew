import {
  getStylingSessionStatusPresentation,
  type FashionGenre,
  type PaidActionExecutionReceipt,
} from "@hairfit/shared";

export const MOBILE_STYLER_GENRE_LABELS: Record<FashionGenre, string> = {
  minimal: "미니멀",
  street: "스트리트",
  casual: "캐주얼",
  classic: "클래식",
  office: "오피스",
  date: "데이트",
  formal: "포멀",
  athleisure: "애슬레저",
};

export function getMobileStylerSessionMessage(status: string) {
  const presentation = getStylingSessionStatusPresentation(status);
  if (presentation.status === "recommended") return "패션 추천이 준비되었습니다. 최신 서버 견적을 확인한 뒤 직접 생성을 시작해 주세요.";
  if (presentation.status === "generating") return "백그라운드 생성이 접수되었습니다. 앱을 닫거나 다른 화면으로 이동해도 서버에서 계속 처리하며, 완료되면 계정 이메일로 안내합니다.";
  if (presentation.status === "completed") return "룩북 생성이 완료되었습니다. 아래 크레딧 처리 영수증도 함께 확인할 수 있습니다.";
  if (presentation.status === "failed") return "생성에 실패했습니다. 예약 크레딧 복구 영수증과 최신 견적을 확인한 뒤 직접 다시 시도해 주세요.";
  return "현재 룩북 상태를 확인해 주세요.";
}

export function getMobileStylerNotificationMessage(status?: string | null) {
  if (status === "sent") return "완료 이메일을 발송했습니다.";
  if (status === "pending" || status === "sending" || status === "retry_wait") return "완료 이메일을 발송하고 있습니다.";
  if (status === "skipped") return "계정 이메일을 확인할 수 없어 앱 화면에서만 결과를 안내합니다.";
  if (status === "dead_letter" || status === "delivery_unknown") return "이메일 발송 상태를 확인하지 못했습니다. 결과와 크레딧 상태는 이 화면에서 확인할 수 있습니다.";
  return null;
}

export function getMobileStylerReceiptHeading(receipt: PaidActionExecutionReceipt) {
  if (receipt.state === "reserved") return "크레딧 예약 중";
  if (receipt.state === "charged") return `${receipt.chargedCredits}크레딧 차감 완료`;
  if (receipt.state === "refunded") return `${receipt.refundedCredits}크레딧 자동 복구 완료`;
  return "추가 차감 없는 실행";
}

export function getMobileStylerReceiptDescription(receipt: PaidActionExecutionReceipt) {
  if (receipt.state === "reserved") return "생성 작업이 끝날 때까지 서버가 크레딧을 안전하게 예약하고 있습니다.";
  if (receipt.state === "charged") return "룩북 생성이 완료되어 예약 크레딧이 최종 차감되었습니다.";
  if (receipt.state === "refunded") return "생성이 완료되지 않아 서버가 예약 크레딧을 잔액으로 되돌렸습니다.";
  return receipt.freeReason || "서버 정책에 따라 크레딧을 차감하지 않았습니다.";
}
