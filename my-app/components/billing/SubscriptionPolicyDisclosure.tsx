import { SUBSCRIPTION_BILLING_POLICY_KO } from "@hairfit/shared";
import Link from "next/link";
import { cn } from "../../lib/utils";

export interface SubscriptionPolicyDisclosureProps {
  compact?: boolean;
  className?: string;
}

function getWebPolicyCopy(item: (typeof SUBSCRIPTION_BILLING_POLICY_KO)[number]) {
  if (item.id === "creditGrant") {
    return {
      title: "월 이용권 등록",
      description: "월 이용권은 카드 승인과 HairFit의 결제 확인이 모두 끝난 뒤 계정에 등록됩니다.",
    };
  }
  if (item.id === "unusedCredits") {
    return {
      title: "미사용 이용권",
      description: "현재 정책에서는 사용하지 않은 이용권 잔여분이 계정에 남으며 구독 해지 예약만으로 삭제되지 않습니다.",
    };
  }
  return item;
}

export function SubscriptionPolicyDisclosure({
  compact = false,
  className,
}: SubscriptionPolicyDisclosureProps) {
  return (
    <section
      aria-label="정기결제·해지 정책"
      className={cn("c-subscription-policy", className)}
      data-density={compact ? "compact" : "default"}
      data-policy-count={SUBSCRIPTION_BILLING_POLICY_KO.length}
    >
      <ul className="c-subscription-policy__list">
        {SUBSCRIPTION_BILLING_POLICY_KO.map((item) => {
          const copy = getWebPolicyCopy(item);
          return (
            <li className="c-subscription-policy__item" data-policy-id={item.id} key={item.id}>
              <strong className="c-subscription-policy__title">{copy.title}</strong>
              <span className="c-subscription-policy__description">{copy.description}</span>
            </li>
          );
        })}
      </ul>
      <nav aria-label="결제 정책 관련 링크" className="c-subscription-policy__links">
        <Link href="/terms-of-service" className="c-subscription-policy__link">
          이용 약관
        </Link>
        <Link href="/privacy-policy" className="c-subscription-policy__link">
          개인정보 처리방침
        </Link>
        <Link href="/support" className="c-subscription-policy__link">
          결제·환불 문의
        </Link>
      </nav>
    </section>
  );
}
