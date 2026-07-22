import { SUBSCRIPTION_BILLING_POLICY_KO } from "@hairfit/shared";
import Link from "next/link";
import { cn } from "../../lib/utils";

export interface SubscriptionPolicyDisclosureProps {
  compact?: boolean;
  className?: string;
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
        {SUBSCRIPTION_BILLING_POLICY_KO.map((item) => (
          <li className="c-subscription-policy__item" data-policy-id={item.id} key={item.id}>
            <strong className="c-subscription-policy__title">{item.title}</strong>
            <span className="c-subscription-policy__description">{item.description}</span>
          </li>
        ))}
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
