import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenText, Check, ChevronDown, Handshake, Megaphone, Sparkles } from "lucide-react";
import { PartnershipLeadForm } from "../../components/partnerships/PartnershipLeadForm";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";

const title = "광고·제휴 문의";
const description = "HairFit과 광고, 브랜디드 콘텐츠, 공동 캠페인을 제안하고 브랜드 목표에 맞는 협업 가능성을 검토하세요.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/partnerships",
  },
  openGraph: {
    title: `${title} - HairFit`,
    description,
    url: "/partnerships",
    type: "website",
    locale: "ko_KR",
    images: [
      {
        url: "/hero/fashion-demo/lookbook-board.png",
        width: 1717,
        height: 916,
        alt: "HairFit 헤어와 패션 스타일 미리보기 보드",
      },
    ],
  },
};

const partnershipAreas = [
  {
    icon: Megaphone,
    title: "광고",
    description: "HairFit의 스타일 탐색 맥락 안에서 브랜드와 제품을 자연스럽게 소개하는 방식을 검토합니다.",
  },
  {
    icon: BookOpenText,
    title: "브랜디드 콘텐츠",
    description: "헤어·패션 선택에 도움이 되는 주제와 브랜드 메시지를 연결해 콘텐츠 경험을 함께 설계합니다.",
  },
  {
    icon: Handshake,
    title: "공동 캠페인",
    description: "시즌, 신제품, 고객 참여 목표에 맞춰 HairFit의 미리보기 경험을 활용한 캠페인을 논의합니다.",
  },
] as const;

const processSteps = [
  ["01", "제안 접수", "캠페인 목표, 타깃, 일정과 예산 구간을 알려주세요."],
  ["02", "적합성 검토", "HairFit 제품 경험과 브랜드 목적이 연결되는 지점을 확인합니다."],
  ["03", "범위 협의", "가능한 형식, 역할, 일정과 운영 조건을 구체화합니다."],
  ["04", "실행 결정", "양측이 범위와 조건에 합의한 협업만 실행합니다."],
] as const;

const faqs = [
  ["확정 광고 단가가 있나요?", "현재 공개 단가표는 운영하지 않습니다. 제안의 목표, 범위, 제작 및 운영 조건을 확인한 뒤 개별 협의합니다."],
  ["어떤 브랜드가 문의할 수 있나요?", "헤어, 뷰티, 패션처럼 스타일 탐색 경험과 연결되는 브랜드를 우선 검토합니다. 그 밖의 제안도 기타 제휴로 전달할 수 있습니다."],
  ["자료를 첨부할 수 있나요?", "파일 첨부는 지원하지 않습니다. 공개된 캠페인 또는 브랜드 자료가 있다면 참고 URL에 HTTP(S) 주소를 남겨주세요."],
  ["제안을 보내면 협업이 확정되나요?", "아닙니다. 제출은 검토 요청이며, 실제 협업은 범위와 조건에 대한 별도 합의 후 확정됩니다."],
] as const;

export default function PartnershipsPage() {
  return (
    <AppPage className="max-w-6xl pb-16 pt-5 sm:pt-8">
      <Panel as="header" className="overflow-hidden p-0">
        <div className="grid lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
          <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
            <p className="app-kicker">HairFit for brands</p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.04em] text-[var(--app-text)] sm:text-5xl">
              스타일을 고르는 순간에<br />브랜드 경험을 연결합니다
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--app-muted)] sm:text-base">
              HairFit의 헤어·패션 미리보기 경험과 브랜드의 캠페인 목표가 만나는 광고, 브랜디드 콘텐츠, 공동 캠페인을 제안해 주세요.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="#partnership-inquiry"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-ring)]"
              >
                제휴 제안 보내기
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <span className="text-xs leading-5 text-[var(--app-muted)]">제안 접수는 협업 확정을 의미하지 않습니다.</span>
            </div>
          </div>
          <div className="relative min-h-[310px] border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] lg:min-h-[520px] lg:border-l lg:border-t-0">
            <Image
              src="/hero/fashion-demo/lookbook-board.png"
              alt="HairFit에서 헤어와 패션 스타일을 함께 탐색하는 실제 제품 이미지"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/60 bg-white/90 px-4 py-3 text-xs font-bold leading-5 text-stone-800 shadow-sm backdrop-blur sm:inset-x-6 sm:bottom-6">
              실제 HairFit 미리보기 화면을 바탕으로 협업 접점을 검토합니다.
            </div>
          </div>
        </div>
      </Panel>

      <section aria-labelledby="partnership-areas-title" className="mt-14">
        <div className="max-w-2xl">
          <p className="app-kicker">Partnership formats</p>
          <h2 id="partnership-areas-title" className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">
            함께 만들 수 있는 세 가지 경험
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {partnershipAreas.map((area) => {
            const Icon = area.icon;
            return (
              <SurfaceCard key={area.title} className="p-5 sm:p-6">
                <Icon className="h-6 w-6 text-[var(--app-text)]" aria-hidden="true" />
                <h3 className="mt-5 text-xl font-black text-[var(--app-text)]">{area.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{area.description}</p>
              </SurfaceCard>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="product-experience-title" className="mt-14 grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <div className="relative min-h-[360px] overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] sm:min-h-[500px]">
          <Image
            src="/landing/editorial/salon-consultation.webp"
            alt="HairFit 스타일 상담 제품 경험"
            fill
            sizes="(max-width: 1024px) 100vw, 52vw"
            className="object-cover"
          />
        </div>
        <SurfaceCard className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
          <p className="app-kicker">Product experience</p>
          <h2 id="product-experience-title" className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">
            제품을 보는 데서 끝나지 않고, 내 스타일로 상상하도록
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">
            HairFit은 사용자가 헤어스타일과 패션 무드를 탐색하고 비교하는 제품 경험을 제공합니다. 협업은 이 선택 흐름을 해치지 않으면서 브랜드가 실질적인 영감을 더할 수 있는지를 중심으로 검토합니다.
          </p>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-[var(--app-text)]">
            {[
              "사용자의 스타일 탐색 맥락과 맞는 메시지",
              "헤어·뷰티 선택에 도움이 되는 콘텐츠",
              "브랜드 목표와 사용자 경험을 함께 고려한 범위",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link href="#partnership-inquiry" className="mt-7 inline-flex items-center gap-2 self-start text-sm font-black text-[var(--app-text)] underline decoration-2 underline-offset-4">
            제휴 제안 보내기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </SurfaceCard>
      </section>

      <section aria-labelledby="partnership-process-title" className="mt-14">
        <p className="app-kicker">How we work</p>
        <h2 id="partnership-process-title" className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">협업 절차</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map(([number, stepTitle, stepDescription]) => (
            <li key={number} className="border-t-2 border-[var(--app-border-strong)] pt-4">
              <span className="text-xs font-black tracking-[0.16em] text-[var(--app-muted)]">{number}</span>
              <h3 className="mt-3 text-lg font-black text-[var(--app-text)]">{stepTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{stepDescription}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="partnership-faq-title" className="mt-14 grid gap-6 lg:grid-cols-[0.38fr_0.62fr]">
        <div>
          <p className="app-kicker">FAQ</p>
          <h2 id="partnership-faq-title" className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">문의 전 확인해 주세요</h2>
          <Sparkles className="mt-6 h-7 w-7 text-[var(--app-text)]" aria-hidden="true" />
        </div>
        <div className="divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
          {faqs.map(([question, answer]) => (
            <details key={question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-[var(--app-text)] marker:hidden">
                <span>{question}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-14">
        <PartnershipLeadForm />
      </div>
    </AppPage>
  );
}
