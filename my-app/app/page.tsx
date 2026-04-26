import dynamic from "next/dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { FashionDemoShowcase } from "../components/home/FashionDemoShowcase";
import { HeroSection } from "../components/home/HeroSection";
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

const PricingPreview = dynamic(() => import("../components/home/PricingPreview").then((mod) => mod.PricingPreview), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

const ReviewCarousel = dynamic(() => import("../components/home/ReviewCarousel").then((mod) => mod.ReviewCarousel), {
  loading: () => <div className="h-64 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

const siteUrl = getSiteUrl();

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
        description: "정면 사진 기반 3x3 헤어스타일 후보 미리보기",
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
  ];
}

function FloatingHomeNav() {
  return (
    <nav
      aria-label="홈페이지 섹션 바로가기"
      className="fixed right-[max(1rem,calc((100vw-72rem)/2-6rem))] top-1/2 z-40 hidden -translate-y-1/2 min-[1360px]:flex"
    >
      <div className="flex flex-col gap-1.5 rounded-full border border-stone-200/80 bg-white/90 p-2 shadow-2xl shadow-stone-950/15 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/82 dark:shadow-black/35">
        {homeNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full text-[0.68rem] font-black text-stone-500 transition hover:-translate-y-0.5 hover:bg-stone-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:text-zinc-400 dark:hover:bg-white dark:hover:text-stone-950"
          >
            <span aria-hidden="true">{item.shortLabel}</span>
            <span className="pointer-events-none absolute right-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 opacity-0 shadow-lg transition group-hover:block group-hover:opacity-100 group-focus-visible:block group-focus-visible:opacity-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
              {item.label}
            </span>
            <span className="sr-only">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default async function HomePage() {
  const jsonLd = buildHomeJsonLd();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:gap-10 sm:py-12">
      <FloatingHomeNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div id="home-hero" className="scroll-mt-24">
        <HeroSection />
      </div>

      <section
        id="home-workflow"
        className="scroll-mt-24 rounded-3xl border border-stone-200/70 bg-white/95 p-6 shadow-xl transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:p-8"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">
            How HairFit Works
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white sm:text-3xl">
            AI 헤어스타일 미리보기는 3단계면 충분합니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300 sm:text-base">
            검색창에서 남의 사진을 오래 찾기보다, 내 얼굴 사진을 기준으로 어울리는 후보를 먼저 좁히고 상담용 이미지로 저장하세요.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {homeWorkflow.map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/55"
            >
              <p className="text-xs font-black tracking-[0.22em] text-amber-600 dark:text-amber-400">{item.step}</p>
              <h3 className="mt-3 text-lg font-black text-stone-950 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-zinc-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div id="home-demo" className="scroll-mt-24">
        <FashionDemoShowcase />
      </div>
      <div className="scroll-mt-24">
        <FeatureShowcase />
      </div>

      <section id="home-criteria" className="grid scroll-mt-24 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-stone-200/70 bg-white/95 p-6 shadow-xl transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">
            Recommendation Criteria
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white sm:text-3xl">
            얼굴형 헤어스타일 추천은 이런 기준으로 비교합니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300">
            HairFit은 AI 헤어스타일 미리보기 결과를 단순 합성 이미지로 끝내지 않고, 실제 상담에서 설명하기 쉬운 기준으로 정리합니다.
          </p>
          <Link
            href="/upload"
            className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 dark:bg-white dark:text-stone-950 dark:hover:bg-zinc-200"
          >
            내 얼굴로 추천 받아보기
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {recommendationCriteria.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <h3 className="text-base font-black text-stone-950 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-zinc-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="home-salon"
        className="scroll-mt-24 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-xl transition-colors dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-50 sm:p-8"
      >
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              Salon Consultation
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              미용실 상담 이미지는 설명 시간을 줄여줍니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-amber-900/85 dark:text-amber-50/80">
              앞머리, 옆볼륨, 길이감처럼 말로 애매한 부분을 이미지로 먼저 보여주면 디자이너와 같은 방향을 더 빨리 잡을 수 있습니다.
            </p>
          </div>
          <ul className="grid gap-3">
            {salonUseCases.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-amber-200/80 bg-white/70 px-4 py-3 text-sm font-bold leading-6 shadow-sm dark:border-amber-300/15 dark:bg-black/20"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div id="home-pricing" className="scroll-mt-24">
        <PricingPreview />
      </div>

      <section
        id="home-faq"
        className="scroll-mt-24 rounded-3xl border border-stone-200/70 bg-white/95 p-6 shadow-xl transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:p-8"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">FAQ</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white sm:text-3xl">
            AI 헤어스타일 미리보기를 시작하기 전 자주 묻는 질문
          </h2>
        </div>
        <div className="mt-6 grid gap-3">
          {homeFaqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-stone-200 bg-stone-50 p-5 open:bg-white dark:border-zinc-800 dark:bg-zinc-950/55 dark:open:bg-zinc-900"
            >
              <summary className="cursor-pointer list-none text-base font-black text-stone-950 dark:text-white">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <div id="home-reviews" className="scroll-mt-24">
        <ReviewCarousel />
      </div>
    </div>
  );
}
