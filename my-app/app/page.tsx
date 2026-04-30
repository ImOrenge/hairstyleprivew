import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { createClerkClient } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";
import { B2BLeadForm } from "../components/home/B2BLeadForm";
import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { FashionDemoShowcase } from "../components/home/FashionDemoShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { AppPage, InverseSection, Panel, SurfaceCard } from "../components/ui/Surface";
import { getProductionClerkSecretKey } from "../lib/clerk";
import {
  homeFaqs,
  homeNavItems,
  homeSeo,
  homeWorkflow,
  recommendationCriteria,
  salonUseCases,
  structuredDataName,
} from "../lib/home-content";
import { getSiteUrl } from "../lib/site-url";

const PricingPreview = nextDynamic(() => import("../components/home/PricingPreview").then((mod) => mod.PricingPreview), {
  loading: () => <div className="h-96 animate-pulse border border-[var(--app-border)] bg-[var(--app-surface-muted)]" />,
});

const ReviewCarousel = nextDynamic(() => import("../components/home/ReviewCarousel").then((mod) => mod.ReviewCarousel), {
  loading: () => <div className="h-64 animate-pulse border border-[var(--app-border)] bg-[var(--app-surface-muted)]" />,
});

const siteUrl = getSiteUrl();

export const dynamic = "force-dynamic";

type HomeSocialProof = {
  userCount: number;
  avatars: string[];
};

async function loadHomeSocialProof(): Promise<HomeSocialProof> {
  return loadSocialProofFromProductionClerk();
}

async function loadSocialProofFromProductionClerk(): Promise<HomeSocialProof> {
  const productionSecretKey = getProductionClerkSecretKey();
  if (!productionSecretKey) {
    return { userCount: 0, avatars: [] };
  }

  try {
    const client = createClerkClient({ secretKey: productionSecretKey });
    const [userCount, latestUsers] = await Promise.all([
      client.users.getCount(),
      client.users.getUserList({
        limit: 6,
        orderBy: "-created_at",
      }),
    ]);

    return {
      userCount,
      avatars: latestUsers.data
        .map((user) => user.imageUrl)
        .filter((url): url is string => Boolean(url) && !url.includes("default-user-icon")),
    };
  } catch (error) {
    console.error("[home] Failed to fetch production Clerk social proof:", error);
    return { userCount: 0, avatars: [] };
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: homeSeo.title,
  description: homeSeo.description,
  keywords: homeSeo.keywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homeSeo.title,
    description: homeSeo.description,
    url: "/",
    siteName: "HairFit",
    type: "website",
    locale: "ko_KR",
    images: [
      {
        url: "/hero/fashion-demo/lookbook-board.png",
        width: 1200,
        height: 630,
        alt: "HairFit AI 헤어스타일 미리보기와 미용실 상담 이미지 예시",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeSeo.title,
    description: homeSeo.description,
    images: ["/hero/fashion-demo/lookbook-board.png"],
  },
};

function buildHomeJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: structuredDataName,
      url: siteUrl,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      inLanguage: "ko-KR",
      description: homeSeo.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
        description: "정면 사진 한 장으로 9가지 헤어 후보를 비교하고 선택한 헤어에 맞춘 패션 코디까지 확인",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: structuredDataName,
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      sameAs: [],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: structuredDataName,
      url: siteUrl,
      description: "AI 헤어스타일 미리보기와 헤어에 맞춘 패션 코디 추천 서비스",
      inLanguage: "ko-KR",
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "AI 헤어스타일 미리보기와 패션 코디 추천 3단계",
      description: "정면 사진으로 얼굴형에 맞는 헤어스타일을 비교하고 선택한 헤어에 맞춘 패션 코디로 이어가는 방법",
      step: homeWorkflow.map((item, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: item.title,
        text: item.description,
      })),
    },
  ];
}

function FloatingHomeNav() {
  return (
    <nav
      aria-label="홈페이지 섹션 바로가기"
      className="fixed right-[max(1rem,calc((100vw-72rem)/2-6rem))] top-1/2 z-40 hidden -translate-y-1/2 min-[1360px]:flex"
    >
      <div className="flex flex-col gap-1.5 border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-2xl">
        {homeNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative flex h-11 w-11 items-center justify-center border border-transparent text-[0.68rem] font-black text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <span aria-hidden="true">{item.shortLabel}</span>
            <span className="pointer-events-none absolute right-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] opacity-0 shadow-lg transition group-hover:block group-hover:opacity-100 group-focus-visible:block group-focus-visible:opacity-100">
              {item.label}
            </span>
            <span className="sr-only">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function FinalCtaBlock() {
  return (
    <InverseSection
      as="section"
      aria-label="서비스 시작하기"
      className="p-8 text-center sm:p-10"
    >
      <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
        사진 한 장으로 내 스타일을 시작하세요
      </h2>
      <p className="app-inverse-muted mt-3 text-sm leading-6 sm:text-base">
        9가지 헤어 후보를 먼저 비교하고, 선택한 헤어에 맞는 패션 코디까지 이어보세요.
      </p>
      <Link
        href="/upload"
        className="app-inverse-cta mt-7 inline-flex items-center gap-2 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.04em] transition"
      >
        무료로 내 스타일 보기
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </InverseSection>
  );
}

function MobileStickyCtaBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-2 lg:hidden">
      <Link
        href="/upload"
        className="flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
      >
        무료로 내 스타일 보기
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const jsonLd = buildHomeJsonLd();
  const { userCount, avatars } = await loadHomeSocialProof();

  return (
    <>
      <AppPage className="flex flex-col gap-6 pb-24 sm:gap-8 lg:pb-8">
        <FloatingHomeNav />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />

        {/* 1. Hero */}
        <div id="home-hero" className="scroll-mt-24">
          <HeroSection userCount={userCount} avatars={avatars} />
        </div>

        {/* 2. Fashion Demo */}
        <div id="home-fashion" className="scroll-mt-24">
          <FashionDemoShowcase />
        </div>

        {/* 3. 사용 흐름 */}
        <Panel
          as="section"
          id="home-workflow"
          className="scroll-mt-24 p-5 sm:p-6"
        >
          <div className="max-w-3xl">
            <p className="app-kicker">
              How HairFit Works
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
              사진 한 장으로 9가지 후보까지
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)] sm:text-base">
              업로드, 비교, 저장만 기억하면 됩니다. 패션 추천은 선택한 헤어 이후에 자연스럽게 이어집니다.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {homeWorkflow.map((item) => (
              <SurfaceCard as="article" key={item.step} className="p-4">
                <p className="text-xs font-black tracking-[0.22em] text-[var(--app-accent-strong)]">{item.step}</p>
                <h3 className="mt-3 text-lg font-black text-[var(--app-text)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{item.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </Panel>

        {/* 4. 헤어+패션 차별점 */}
        <div id="home-features" className="scroll-mt-24">
          <FeatureShowcase />
        </div>

        {/* 5. 추천 기준 */}
        <section id="home-criteria" className="grid scroll-mt-24 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel className="p-5 sm:p-6">
            <p className="app-kicker">
              Recommendation Criteria
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
              얼굴형 헤어스타일 추천은 이런 기준으로 비교합니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              HairFit은 AI 헤어스타일 미리보기 결과를 단순 합성 이미지로 끝내지 않고, 패션 코디와 상담 이미지로 이어가기 쉬운 기준으로 정리합니다.
            </p>
            <Link
              href="/upload"
              className="mt-6 inline-flex rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
            >
              사진 한 장으로 시작하기
            </Link>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            {recommendationCriteria.map((item) => (
              <SurfaceCard
                as="article"
                key={item.title}
                className="p-4 transition-colors"
              >
                <h3 className="text-base font-black text-[var(--app-text)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{item.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        {/* 6. 가격 */}
        <div id="home-pricing" className="scroll-mt-24">
          <PricingPreview />
        </div>

        {/* 7. 후기/신뢰 */}
        <div id="home-reviews" className="scroll-mt-24">
          <ReviewCarousel />
        </div>

        {/* 8. FAQ */}
        <Panel
          as="section"
          id="home-faq"
          className="scroll-mt-24 p-5 sm:p-6"
        >
          <div className="max-w-3xl">
            <p className="app-kicker">FAQ</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
              AI 헤어스타일 미리보기를 시작하기 전 자주 묻는 질문
            </h2>
          </div>
          <div className="mt-6 grid gap-3">
            {homeFaqs.map((faq) => (
              <SurfaceCard
                as="details"
                key={faq.question}
                className="group p-4 open:bg-[var(--app-surface)]"
              >
                <summary className="cursor-pointer list-none text-base font-black text-[var(--app-text)]">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{faq.answer}</p>
              </SurfaceCard>
            ))}
          </div>
        </Panel>

        {/* 9. 살롱/B2B 보조 전환 */}
        <Panel
          as="section"
          id="home-salon"
          className="scroll-mt-24 border-[var(--app-accent)] p-5 text-[var(--app-text)] sm:p-6"
        >
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="app-kicker">
                Salon Consultation
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                살롱에서도 상담 이미지로 활용할 수 있습니다
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                HairFit의 9가지 헤어 후보와 패션 코디 흐름은 고객이 원하는 분위기를 이미지로 정리하는 보조 자료로 활용할 수 있습니다.
              </p>
            </div>
            <div className="grid gap-3">
              <ul className="grid gap-3">
                {salonUseCases.map((item) => (
                  <SurfaceCard
                    as="li"
                    key={item}
                    className="px-4 py-3 text-sm font-bold leading-6"
                  >
                    {item}
                  </SurfaceCard>
                ))}
              </ul>
              <B2BLeadForm />
            </div>
          </div>
        </Panel>

        {/* 10. 마감 CTA */}
        <FinalCtaBlock />
      </AppPage>

      {/* 모바일 고정 CTA 바 */}
      <MobileStickyCtaBar />
    </>
  );
}
