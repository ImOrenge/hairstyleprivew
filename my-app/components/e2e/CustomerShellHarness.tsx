/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Clock3, HeartPulse, Sparkles } from "lucide-react";
import { CustomerPageHeader, CustomerShell } from "../customer/CustomerShell";

export function CustomerShellHarness() {
  return (
    <CustomerShell activePath="/home">
      <div className="customer-page" data-e2e-customer-shell="true">
        <CustomerPageHeader
          eyebrow="Private AI Atelier"
          title="지수님, 오늘은 어떤 변화를 원하세요?"
          description="원하는 분위기와 관리 습관을 함께 살펴보고, 내 얼굴에 맞는 스타일을 차분하게 찾아드릴게요."
          action={<span className="customer-secondary-button">120 크레딧 · Pro</span>}
        />

        <section className="customer-home-hero customer-card">
          <div className="customer-home-hero__copy">
            <p className="customer-kicker">New consultation</p>
            <h2>나답게 바뀌는 가장 편안한 방법</h2>
            <p>기존 상담 방식 그대로 사진과 답변을 이어가면 얼굴 균형과 현실적인 관리 조건을 함께 고려해 추천해 드립니다.</p>
            <Link href="/consulting/new" className="customer-primary-button">
              새 컨설팅 시작 <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="customer-home-hero__visual">
            <img src="/discovery/models/women-hairstyle/preview-03.webp" alt="헤어 컨설팅 스타일 예시" />
          </div>
        </section>

        <section className="customer-home-priority" aria-labelledby="harness-priority-heading">
          <div className="customer-section-heading">
            <div>
              <p className="customer-kicker">Continue</p>
              <h2 id="harness-priority-heading">지금 필요한 일부터</h2>
            </div>
          </div>
          <div className="customer-home-priority__grid">
            {[
              { icon: Clock3, kicker: "1 · 진행 중", title: "진행 중인 컨설팅이 있어요", body: "오늘 시작한 작업을 이어서 확인하세요.", action: "이어서 보기" },
              { icon: Sparkles, kicker: "2 · 최근 결과", title: "내추럴 레이어드 컷", body: "완성된 스타일을 다시 비교해 보세요.", action: "결과 다시 보기" },
              { icon: HeartPulse, kicker: "3 · 케어", title: "스타일을 오래 유지해요", body: "확정한 시술의 관리 가이드를 확인하세요.", action: "케어 확인" },
            ].map((item) => (
              <article key={item.kicker} className="customer-card customer-home-priority__card">
                <item.icon aria-hidden="true" />
                <p className="customer-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <span className="customer-text-link">{item.action} <ArrowRight aria-hidden="true" /></span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </CustomerShell>
  );
}
