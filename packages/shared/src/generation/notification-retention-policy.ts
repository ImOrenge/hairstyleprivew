export const NOTIFICATION_OUTBOX_RETENTION_POLICY = {
  completedPayloadDays: 30,
  manualReviewPayloadDays: 90,
  metadataDays: 365,
} as const;

export const NOTIFICATION_RETENTION_DISCLOSURE_KO = [
  "생성 완료 이메일의 수신자 정보와 본문은 발송 완료 또는 수신자 없음 처리 후 30일이 지나면 비식별화합니다.",
  "발송 실패 또는 전달 여부 확인이 필요한 건은 고객지원과 중복 발송 방지를 위해 최대 90일 보관한 뒤 비식별화하며, 상태와 중복 방지 메타데이터는 최대 1년 후 삭제합니다.",
] as const;
