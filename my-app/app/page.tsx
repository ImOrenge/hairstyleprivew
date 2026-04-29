import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { ArrowRight, Shirt } from "lucide-react";
import { B2BLeadForm } from "../components/home/B2BLeadForm";
import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { FashionDemoShowcase } from "../components/home/FashionDemoShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { getClerkConfigState } from "../lib/clerk";
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
import { getSupabaseAdminClient, isSupabaseConfigured } from "../lib/supabase";

const PricingPreview = nextDynamic(() => import("../components/home/PricingPreview").then((mod) => mod.PricingPreview), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

const ReviewCarousel = nextDynamic(() => import("../components/home/ReviewCarousel").then((mod) => mod.ReviewCarousel), {
  loading: () => <div className="h-64 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

const siteUrl = getSiteUrl();

export const dynamic = "force-dynamic";

type HomeSocialProof = {
  userCount: number;
  avatars: string[];
};

async function loadSocialProofFromSupabase(): Promise<HomeSocialProof | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [{ count, error: countError }, { data: avatarRows, error: avatarError }] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase
        .from("users")
        .select("avatar_url")
        .not("avatar_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    if (countError || avatarError) {
      console.error("[home] Failed to fetch Supabase social proof:", countError ?? avatarError);
      return null;
    }

    return {
      userCount: count ?? 0,
      avatars: (avatarRows ?? [])
        .map((row) => (typeof row.avatar_url === "string" ? row.avatar_url : ""))
        .filter((url) => url.length > 0),
    };
  } catch (error) {
    console.error("[home] Failed to fetch Supabase social proof:", error);
    return null;
  }
}

async function loadHomeSocialProof(): Promise<HomeSocialProof> {
  const supabaseSocialProof = await loadSocialProofFromSupabase();
  const clerkSocialProof = await loadSocialProofFromClerk();

  if (supabaseSocialProof && supabaseSocialProof.userCount > 0) {
    if (supabaseSocialProof.avatars.length > 0) {
      return supabaseSocialProof;
    }

    return {
      userCount: supabaseSocialProof.userCount,
      avatars: clerkSocialProof.avatars,
    };
  }

  if (clerkSocialProof.userCount > 0 || clerkSocialProof.avatars.length > 0) {
    return clerkSocialProof;
  }

  if (supabaseSocialProof) {
    return supabaseSocialProof;
  }

  return { userCount: 0, avatars: [] };
}

async function loadSocialProofFromClerk(): Promise<HomeSocialProof> {
  const clerkConfig = getClerkConfigState();
  if (!clerkConfig.canUseClerkServer) {
    return { userCount: 0, avatars: [] };
  }

  try {
    const client = await clerkClient();
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
    console.error("[home] Failed to fetch Clerk social proof:", error);
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

function FinalCtaBlock() {
  return (
    <section
      aria-label="서비스 시작하기"
      className="rounded-3xl border border-stone-200/15 bg-stone-950 p-8 text-center text-white shadow-2xl sm:p-12"
    >
      <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
        사진 한 장으로 내 스타일을 시작하세요
      </h2>
      <p className="mt-3 text-sm leading-6 text-stone-300 sm:text-base">
        9가지 헤어 후보를 먼저 비교하고, 선택한 헤어에 맞는 패션 코디까지 이어보세요.
      </p>
      <Link
        href="/upload"
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold !text-stone-950 transition hover:bg-zinc-100"
      >
        무료로 내 스타일 보기
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function MobileStickyCtaBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
      <Link
        href="/upload"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-stone-950 px-5 py-3 text-sm font-bold !text-white transition hover:bg-stone-800 dark:bg-white dark:!text-stone-950 dark:hover:bg-zinc-100"
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 pb-24 sm:gap-10 sm:py-12 lg:pb-12">
        <FloatingHomeNav />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />

        {/* 1. Hero */}
        <div id="home-hero" className="-mx-2 scroll-mt-24 sm:-mx-4 lg:-mx-10 xl:-mx-16">
          <HeroSection userCount={userCount} avatars={avatars} />
        </div>

        {/* 2. 사용 흐름 */}
        <section
          id="home-workflow"
          className="scroll-mt-24 rounded-3xl border border-stone-200/70 bg-white/95 p-6 shadow-xl transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:p-8"
        >
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">
              How HairFit Works
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white sm:text-3xl">
              사진 한 장으로 9가지 후보까지
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300 sm:text-base">
              업로드, 비교, 저장만 기억하면 됩니다. 패션 추천은 선택한 헤어 이후에 자연스럽게 이어집니다.
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

        {/* 3. 헤어+패션 차별점 */}
        <div id="home-features" className="scroll-mt-24">
          <FeatureShowcase />
        </div>

        {/* 4. 추천 기준 */}
        <section id="home-criteria" className="grid scroll-mt-24 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-stone-200/70 bg-white/95 p-6 shadow-xl transition-colors dark:border-zinc-800/60 dark:bg-zinc-900/50 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500">
              Recommendation Criteria
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white sm:text-3xl">
              얼굴형 헤어스타일 추천은 이런 기준으로 비교합니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300">
              HairFit은 AI 헤어스타일 미리보기 결과를 단순 합성 이미지로 끝내지 않고, 패션 코디와 상담 이미지로 이어가기 쉬운 기준으로 정리합니다.
            </p>
            <Link
              href="/upload"
              className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-bold !text-white transition hover:bg-stone-800 dark:bg-white dark:!text-stone-950 dark:hover:bg-zinc-200"
            >
              사진 한 장으로 시작하기
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

        {/* 브리지: 헤어 후보 비교 → 패션 추천으로 이어지기 */}
        <section
          aria-labelledby="hair-to-fashion-bridge"
          className="scroll-mt-24 overflow-hidden rounded-3xl border border-stone-200/15 bg-stone-950 p-6 text-white shadow-xl sm:p-8"
        >
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-300">
                <Shirt className="h-4 w-4" aria-hidden="true" />
                Hair to Fashion
              </p>
              <h2 id="hair-to-fashion-bridge" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                헤어를 고르는 순간, 패션 추천의 기준이 생깁니다
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-300 sm:text-base">
                같은 옷도 헤어 길이와 볼륨에 따라 목선, 상체 비율, 전체 분위기가 달라집니다. HairFit은 먼저 어울리는 헤어 후보를 좁힌 뒤, 선택한 스타일을 기준으로 데일리·워크·데이트 코디 방향까지 이어줍니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="#home-demo"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold !text-stone-950 transition hover:bg-zinc-100"
                >
                  패션 추천 예시 보기
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/upload"
                  className="inline-flex items-center rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  사진 한 장으로 시작
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "헤어 라인", body: "짧은 머리와 긴 레이어에 맞춰 목선과 상체 실루엣을 다르게 봅니다." },
                { label: "무드 연결", body: "깔끔한 데일리, 워크, 데이트처럼 헤어가 주는 분위기를 착장 방향으로 옮깁니다." },
                { label: "전신 균형", body: "체형 프로필과 상황을 함께 반영해 룩북 이미지로 확인합니다." },
              ].map((item) => (
                <article key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <h3 className="text-sm font-black text-white">{item.label}</h3>
                  <p className="mt-2 text-xs font-semibold leading-5 text-stone-300">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. 패션 데모 (헤어 플로우의 자연스러운 다음 단계) */}
        <div id="home-demo" className="scroll-mt-24">
          <FashionDemoShowcase />
        </div>

        {/* 6. 가격 */}
        <div id="home-pricing" className="scroll-mt-24">
          <PricingPreview />
        </div>

        {/* 7. FAQ */}
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

        {/* 8. 후기/신뢰 */}
        <div id="home-reviews" className="scroll-mt-24">
          <ReviewCarousel />
        </div>

        {/* 9. 살롱/B2B 보조 전환 */}
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
                살롱에서도 상담 이미지로 활용할 수 있습니다
              </h2>
              <p className="mt-3 text-sm leading-6 text-amber-900/85 dark:text-amber-50/80">
                HairFit의 9가지 헤어 후보와 패션 코디 흐름은 고객이 원하는 분위기를 이미지로 정리하는 보조 자료로 활용할 수 있습니다.
              </p>
            </div>
            <div className="grid gap-3">
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
              <B2BLeadForm />
            </div>
          </div>
        </section>

        {/* 10. 마감 CTA */}
        <FinalCtaBlock />
      </div>

      {/* 모바일 고정 CTA 바 */}
      <MobileStickyCtaBar />
    </>
  );
}
