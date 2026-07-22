export interface SubscriptionBillingPolicyItemKo {
  id: "renewal" | "creditGrant" | "unusedCredits" | "cancellation";
  title: string;
  description: string;
}

export const SUBSCRIPTION_BILLING_POLICY_KO: readonly SubscriptionBillingPolicyItemKo[] = [
  {
    id: "renewal",
    title: "월 자동결제",
    description: "구독은 월 단위이며 현재 결제 기간이 끝날 때 등록한 카드로 다음 결제가 자동 시도됩니다.",
  },
  {
    id: "creditGrant",
    title: "크레딧 지급",
    description: "월 크레딧은 카드 승인과 HairFit의 결제 확인이 모두 끝난 뒤 기존 잔액에 추가됩니다.",
  },
  {
    id: "unusedCredits",
    title: "미사용 크레딧",
    description: "현재 정책에서는 사용하지 않은 크레딧이 잔액에 남으며 구독 해지 예약만으로 삭제되지 않습니다.",
  },
  {
    id: "cancellation",
    title: "구독 해지",
    description: "웹 마이페이지에서 기간 종료 전 해지를 예약할 수 있으며 현재 기간까지 이용한 뒤 다음 자동결제부터 중단됩니다.",
  },
] as const;

export function getSubscriptionBillingPolicyKo(
  id: SubscriptionBillingPolicyItemKo["id"],
): SubscriptionBillingPolicyItemKo {
  const item = SUBSCRIPTION_BILLING_POLICY_KO.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`Unknown subscription billing policy: ${id}`);
  }
  return item;
}
