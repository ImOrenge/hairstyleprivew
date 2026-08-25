/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Clock3, HeartPulse, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { AccountSetupPromptModal } from "../../components/home/AccountSetupPromptModal";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerDashboardForUser } from "../../lib/customer-dashboard-server";
import type { CustomerHomeGeneration } from "../../lib/customer-home-data";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function isGenerationInProgress(item: CustomerHomeGeneration) {
  return ["queued", "pending", "processing", "running", "generating"].includes(item.status.toLowerCase());
}

function generationHref(item: CustomerHomeGeneration) {
  if (isGenerationInProgress(item)) return `/generate/${encodeURIComponent(item.id)}`;
  const variant = item.selectedVariantId ? `?variant=${encodeURIComponent(item.selectedVariantId)}` : "";
  return `/result/${encodeURIComponent(item.id)}${variant}`;
}

export default async function CustomerHomePage() {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/home"));

  const { accountSetupComplete, dashboard, viewerName } = await loadCustomerDashboardForUser(userId);
  const inProgress = dashboard.recentGenerations.find(isGenerationInProgress) ?? null;
  const completed = dashboard.recentGenerations.find((item) => item.status.toLowerCase() === "completed") ?? null;
  const care = dashboard.recentConfirmedStyles[0] ?? null;
  const heroImage =
    completed?.selectedVariantImageUrl ??
    dashboard.recentStylingSessions.find((item) => item.imageUrl)?.imageUrl ??
    care?.selectedVariantImageUrl ??
    null;

  return (
    <CustomerShell>
      <div className="customer-page">
        <AccountSetupPromptModal open={!accountSetupComplete} />
        <CustomerPageHeader
          eyebrow="Private AI Atelier"
          title={`${viewerName}님, 오늘은 어떤 변화를 원하세요?`}
          description="원하는 분위기와 관리 습관을 함께 살펴보고, 내 얼굴에 맞는 스타일을 차분하게 찾아드릴게요."
          action={
            <Link href="/billing" className="customer-secondary-button">
              {dashboard.credits.toLocaleString("ko-KR")} 크레딧 · {dashboard.planKey || "Free"}
            </Link>
          }
        />

        <section className="customer-home-hero customer-card">
          <div className="customer-home-hero__copy">
            <p className="customer-kicker">New consultation</p>
            <h2>나답게 바뀌는 가장 편안한 방법</h2>
            <p>
              기존 상담 방식 그대로 사진과 답변을 이어가면, 얼굴 균형과 현실적인 관리 조건을 함께 고려해 추천해 드립니다.
            </p>
            <Link href="/consulting/new" className="customer-primary-button">
              새 컨설팅 시작
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="customer-home-hero__visual">
            {heroImage ? (
              <img src={heroImage} alt="최근 완성한 스타일" />
            ) : (
              <div className="customer-home-hero__placeholder" aria-hidden="true">
                <span>HF</span>
                <p>Your next signature look</p>
              </div>
            )}
          </div>
        </section>

        <section className="customer-home-priority" aria-labelledby="priority-heading">
          <div className="customer-section-heading">
            <div>
              <p className="customer-kicker">Continue</p>
              <h2 id="priority-heading">지금 필요한 일부터</h2>
            </div>
          </div>

          <div className="customer-home-priority__grid">
            <article className="customer-card customer-home-priority__card">
              <Clock3 aria-hidden="true" />
              <p className="customer-kicker">1 · 진행 중</p>
              <h3>{inProgress ? "진행 중인 컨설팅이 있어요" : "진행 중인 컨설팅이 없어요"}</h3>
              <p>
                {inProgress
                  ? `${formatDate(inProgress.createdAt)} 시작한 작업을 이어서 확인하세요.`
                  : "새 컨설팅을 시작하면 진행 상태를 이곳에서 바로 확인할 수 있어요."}
              </p>
              <Link href={inProgress ? generationHref(inProgress) : "/consulting/new"} className="customer-text-link">
                {inProgress ? "이어서 보기" : "컨설팅 시작"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>

            <article className="customer-card customer-home-priority__card">
              <Sparkles aria-hidden="true" />
              <p className="customer-kicker">2 · 최근 결과</p>
              <h3>{completed?.selectedVariantLabel || "최근 완성된 결과"}</h3>
              <p>{completed ? `${formatDate(completed.createdAt)} 완성된 스타일을 다시 비교해 보세요.` : "완성된 결과가 여기에 모입니다."}</p>
              <Link href={completed ? generationHref(completed) : "/stylebook"} className="customer-text-link">
                {completed ? "결과 다시 보기" : "스타일북 보기"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>

            <article className="customer-card customer-home-priority__card">
              <HeartPulse aria-hidden="true" />
              <p className="customer-kicker">3 · 케어</p>
              <h3>{care?.styleName || "내 스타일을 오래 유지해요"}</h3>
              <p>{care ? `${formatDate(care.serviceDate)} 시술의 관리 가이드를 확인하세요.` : "시술 확정 후 맞춤 관리 가이드가 준비됩니다."}</p>
              <Link href={care ? `/aftercare/${encodeURIComponent(care.id)}` : "/aftercare"} className="customer-text-link">
                케어 확인
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          </div>
        </section>
      </div>
    </CustomerShell>
  );
}
