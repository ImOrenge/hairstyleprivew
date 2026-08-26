/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerStylebookV2 } from "../../lib/v2/customer-history-server";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

export default async function StylebookPage() {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/stylebook"));

  const entries = await loadCustomerStylebookV2(userId);

  return (
    <CustomerShell>
      <div className="customer-page">
        <CustomerPageHeader
          eyebrow="Stylebook"
          title="확정한 나의 스타일을 한곳에"
          description="HairFit 컨설팅에서 최종 확정한 스타일을 시간순으로 모아 다시 확인할 수 있어요."
          action={
            <Link href="/consulting/new" className="customer-primary-button">
              <Plus aria-hidden="true" />
              새 컨설팅
            </Link>
          }
        />

        {entries.length === 0 ? (
          <section className="customer-card customer-empty-state">
            <p className="customer-kicker">Your collection</p>
            <h2>첫 스타일을 만들어 볼까요?</h2>
            <p>컨설팅을 완료하면 추천 결과와 선택한 스타일이 자동으로 이곳에 모입니다.</p>
            <Link href="/consulting/new" className="customer-primary-button">
              컨설팅 시작
              <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section className="customer-stylebook-grid" aria-label="스타일북 기록">
            {entries.map((entry) => (
              <Link
                key={entry.selectionId}
                href={`/result/${encodeURIComponent(entry.resultGenerationId)}`}
                className="customer-card customer-stylebook-card"
              >
                <div className="customer-stylebook-card__visual">
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt={entry.name} loading="lazy" decoding="async" />
                  ) : (
                    <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
                  )}
                </div>
                <div className="customer-stylebook-card__body">
                  <div>
                    <p className="customer-kicker">컨설팅 리설트</p>
                    <h2>{entry.name}</h2>
                    <p>{entry.recommendationReason}</p>
                  </div>
                  <time dateTime={entry.confirmedAt}>{formatDate(entry.confirmedAt)}</time>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
