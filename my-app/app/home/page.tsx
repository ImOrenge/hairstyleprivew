/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Clock3, HeartPulse, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { AccountSetupPromptModal } from "../../components/home/AccountSetupPromptModal";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerDashboardForUser } from "../../lib/customer-dashboard-server";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function formatMembershipLabel(planKey: string | null) {
  if (!planKey) return "무료 멤버십 관리";
  if (planKey === "starter") return "스타터 멤버십 관리";
  if (planKey === "basic") return "베이직 멤버십 관리";
  if (planKey === "standard") return "스탠다드 멤버십 관리";
  if (planKey === "pro") return "프로 멤버십 관리";
  if (planKey === "salon") return "살롱 멤버십 관리";
  return "멤버십 관리";
}

export default async function CustomerHomePage() {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/home"));

  const { accountSetupComplete, customerHome, planKey, viewerName } = await loadCustomerDashboardForUser(userId);
  const { inProgress, completed, care } = customerHome;
  const heroImage = completed?.imageUrl ?? care?.imageUrl ?? null;

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
              {formatMembershipLabel(planKey)}
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
            <div className="flex flex-wrap gap-3">
              <Link href={inProgress?.href ?? "/consulting/new"} className="customer-primary-button">
                {inProgress ? "컨설팅 이어하기" : "새 컨설팅 시작"}
                <ArrowRight aria-hidden="true" />
              </Link>
              {inProgress ? (
                <Link href="/consulting/new" className="customer-secondary-button">
                  새 컨설팅
                </Link>
              ) : null}
            </div>
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
              <h3>{inProgress ? inProgress.stageTitle : "진행 중인 컨설팅이 없어요"}</h3>
              <p>
                {inProgress
                  ? `${formatDate(inProgress.startedAt)} 시작한 상담을 저장된 단계부터 이어가세요.`
                  : "새 컨설팅을 시작하면 진행 상태를 이곳에서 바로 확인할 수 있어요."}
              </p>
              <Link href={inProgress?.href ?? "/consulting/new"} className="customer-text-link">
                {inProgress ? "상담 이어하기" : "컨설팅 시작"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>

            <article className="customer-card customer-home-priority__card">
              <Sparkles aria-hidden="true" />
              <p className="customer-kicker">2 · 최근 결과</p>
              <h3>{completed?.title || "최근 완성된 결과"}</h3>
              <p>{completed ? `${formatDate(completed.completedAt)} 완성된 통합 결과를 다시 확인하세요.` : "완성된 결과가 여기에 모입니다."}</p>
              <Link href={completed?.href ?? "/stylebook"} className="customer-text-link">
                {completed ? "결과 다시 보기" : "스타일북 보기"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>

            <article className="customer-card customer-home-priority__card">
              <HeartPulse aria-hidden="true" />
              <p className="customer-kicker">3 · 케어</p>
              <h3>{care?.styleName || "내 스타일을 오래 유지해요"}</h3>
              <p>{care ? `${formatDate(care.serviceDate)} 시술의 관리 가이드를 확인하세요.` : "시술 확정 후 맞춤 관리 가이드가 준비됩니다."}</p>
              <Link href={care ? `/aftercare/${encodeURIComponent(care.actualServiceId)}` : "/aftercare"} className="customer-text-link">
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
