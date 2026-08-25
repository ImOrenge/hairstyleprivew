/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerDashboardForUser } from "../../lib/customer-dashboard-server";

interface StylebookEntry {
  id: string;
  kind: "컨설팅 결과" | "스타일 추천" | "시술 확정";
  title: string;
  description: string;
  imageUrl: string | null;
  href: string;
  createdAt: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

export default async function StylebookPage() {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/stylebook"));

  const { dashboard } = await loadCustomerDashboardForUser(userId);
  const entries: StylebookEntry[] = [
    ...dashboard.recentGenerations.map((item) => ({
      id: `generation-${item.id}`,
      kind: "컨설팅 결과" as const,
      title: item.selectedVariantLabel || item.promptUsed || "헤어 컨설팅",
      description: item.status.toLowerCase() === "completed" ? "완성된 추천 보드" : "진행 상태 확인",
      imageUrl: item.selectedVariantImageUrl,
      href: item.status.toLowerCase() === "completed"
        ? `/result/${encodeURIComponent(item.id)}${item.selectedVariantId ? `?variant=${encodeURIComponent(item.selectedVariantId)}` : ""}`
        : `/generate/${encodeURIComponent(item.id)}`,
      createdAt: item.createdAt,
    })),
    ...dashboard.recentStylingSessions.map((item) => ({
      id: `styling-${item.id}`,
      kind: "스타일 추천" as const,
      title: item.headline || "나만의 스타일 추천",
      description: item.summary || [item.genre, item.occasion, item.mood].filter(Boolean).join(" · ") || "통합 스타일 방향",
      imageUrl: item.imageUrl,
      href: `/styler/${encodeURIComponent(item.id)}`,
      createdAt: item.createdAt,
    })),
    ...dashboard.recentConfirmedStyles.map((item) => ({
      id: `care-${item.id}`,
      kind: "시술 확정" as const,
      title: item.styleName,
      description: `${item.serviceType} · 케어 가이드 연결됨`,
      imageUrl: item.selectedVariantImageUrl,
      href: `/aftercare/${encodeURIComponent(item.id)}`,
      createdAt: item.confirmedAt,
    })),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return (
    <CustomerShell>
      <div className="customer-page">
        <CustomerPageHeader
          eyebrow="Stylebook"
          title="발견한 나의 스타일을 한곳에"
          description="컨설팅 결과, 선택한 룩, 시술 확정 기록을 시간순으로 모아 다시 비교할 수 있어요."
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
              <Link key={entry.id} href={entry.href} className="customer-card customer-stylebook-card">
                <div className="customer-stylebook-card__visual">
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt={entry.title} loading="lazy" decoding="async" />
                  ) : (
                    <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
                  )}
                </div>
                <div className="customer-stylebook-card__body">
                  <div>
                    <p className="customer-kicker">{entry.kind}</p>
                    <h2>{entry.title}</h2>
                    <p>{entry.description}</p>
                  </div>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
