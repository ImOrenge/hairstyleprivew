export const ACCOUNT_DELETION_CONFIRMATION = "계정 삭제" as const;

export const ACCOUNT_DELETION_DISCLOSURE =
  "회원 탈퇴를 완료하면 생성 사진, 시술 확정 기록, 에프터케어, 프로필, 크레딧, 기기 알림 연결을 복구할 수 없도록 삭제합니다. 진행 중인 생성과 결제 복귀도 중단됩니다.";

export interface AccountDeletionResponse {
  ok: true;
  state: "deleted";
  deletedAt: string;
}
