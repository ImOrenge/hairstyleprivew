import { auth, createClerkClient } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FashionDemoShowcase } from "../components/home/FashionDemoShowcase";
import { FaqShowcase } from "../components/home/FaqShowcase";
import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { HairstylePreviewShowcase } from "../components/home/HairstylePreviewShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { LandingScene, SceneHeader } from "../components/home/LandingScene";
import { MobileStickyCtaBar } from "../components/home/MobileStickyCtaBar";
import { RevealOnScroll } from "../components/home/RevealOnScroll";
import { AppPage } from "../components/ui/Surface";
import { resolveSignedInAccountHomeHref } from "../lib/account-home-server";
import { getClerkConfigState, getProductionClerkSecretKey } from "../lib/clerk";
import {
  homeNavItems,
  homeSeo,
  homeWorkflow,
  recommendationCriteria,
  salonUseCases,
  structuredDataName,
} from "../lib/home-content";
import { getPlanDisplayBenefits } from "../lib/plan-benefit-display";
import { getSiteUrl } from "../lib/site-url";
import { getSubscriptionAccessMode } from "../lib/subscription-access";
import { loadPublishedSupportFaqs } from "../lib/support-server";

const PricingPreview = nextDynamic(
  () => import("../components/home/PricingPreview").then((mod) => mod.PricingPreview),
  { loading: () => <div className="f-landing-skeleton h-96 animate-pulse" /> },
);

const ReviewCarousel = nextDynamic(
  () => import("../components/home/ReviewCarousel").then((mod) => mod.ReviewCarousel),
  { loading: () => <div className="f-landing-skeleton h-64 animate-pulse" /> },
);

const workflowImages = [
  {
    src: "/landing/editorial/workflow-upload-same-person-tablet.webp",
    alt: "한 인물이 태블릿에서 자신과 같은 포니테일과 크림색 니트의 정면 사진 촬영 영역을 확인하는 모습",
  },
  {
    src: "/landing/editorial/workflow-choice-same-person-v2.webp",
    alt: "동일한 크림색 니트 차림의 여성이 같은 태블릿에서 자신의 아홉 가지 헤어 후보 중 하나를 선택하는 모습",
  },
  {
    src: "/landing/editorial/workflow-save-same-person-v2.webp",
    alt: "동일한 여성이 같은 태블릿에서 선택한 헤어와 전신 패션 착장을 확인하고 저장하는 모습",
  },
];

const criteriaImages = [
  {
    src: "/landing/editorial/criteria-face-shape-landmark-system.webp",
    alt: "정면 얼굴 위 중심축과 다점 랜드마크, 관자·광대·턱 폭 브래킷과 대각 비율선으로 얼굴 비율을 분석하는 모습",
  },
  {
    src: "/landing/editorial/criteria-head-balance-metrics.webp",
    alt: "3분의 4 얼굴 위 중첩 정수리 곡선과 높이 눈금, 측두 폭과 후두부 투영선으로 두상 균형을 분석하는 모습",
  },
  {
    src: "/landing/editorial/criteria-length-measurement-system.webp",
    alt: "정면 인물 위 턱·어깨·쇄골 곡선과 세로 눈금, 구간 화살표와 모발 끝 투영선으로 머리 길이를 분석하는 모습",
  },
  {
    src: "/landing/editorial/criteria-style-mood-triptych-v2.webp",
    alt: "동일한 인물의 깔끔한 가르마, 부드러운 레이어, 트렌디한 펌을 세 가지 분석선과 함께 비교하는 모습",
  },
];

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
      client.users.getUserList({ limit: 6, orderBy: "-created_at" }),
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

async function resolveLandingSignedInRedirectHref() {
  if (!getClerkConfigState().canUseClerkServer) {
    return null;
  }

  try {
    const { userId } = await auth();
    return userId ? await resolveSignedInAccountHomeHref(userId) : null;
  } catch (error) {
    console.error("[landing] Failed to resolve signed-in redirect:", error);
    return null;
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: homeSeo.title,
  description: homeSeo.description,
  keywords: homeSeo.keywords,
  alternates: { canonical: "/" },
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

function buildHomeJsonLd(faqs: Array<{ question: string; answer: string }>) {
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
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
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
    <nav className="f-landing-floating-nav" aria-label="홈페이지 섹션 바로가기">
      <ul className="f-landing-floating-nav__list">
        {homeNavItems.map((item) => (
          <li key={item.href}>
            <Link className="f-landing-floating-nav__link" href={item.href}>
              <span aria-hidden="true">{item.shortLabel}</span>
              <span className="f-landing-floating-nav__label" aria-hidden="true">
                {item.label}
              </span>
              <span className="sr-only">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FinalCtaBlock() {
  return (
    <LandingScene
      id="home-final-cta"
      number="11"
      layout="closing-stage"
      tone="inverse"
      aria-label="서비스 시작하기"
    >
      <div className="f-closing-stage">
          <div
            className="f-closing-stage__media"
            data-landing-media
            data-detail-closeup
            data-reveal-item
            data-reveal-order="1"
          >
          <Image
            src="/landing/editorial/final-photo-start.webp"
            alt="정면 사진 한 장으로 새로운 헤어와 스타일 탐색을 시작하는 모습"
            fill
            sizes="(max-width: 840px) 92vw, 55vw"
          />
        </div>
        <div className="f-closing-stage__copy">
          <p className="f-closing-stage__eyebrow" data-reveal-item data-reveal-order="2">Your next look</p>
          <h2 className="f-closing-stage__title" data-reveal-item data-reveal-order="3">
            사진 한 장으로 내 스타일을 시작하세요
          </h2>
          <p className="f-closing-stage__description" data-reveal-item data-reveal-order="4">
            9가지 헤어 후보를 먼저 비교하고, 선택한 헤어에 맞는 패션 코디까지 이어보세요.
          </p>
          <Link
            href="/consulting/new"
            className="f-landing-cta f-landing-cta--inverse"
            data-reveal-item
            data-reveal-order="5"
          >
            AI 헤어 컨설턴트 시작
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </LandingScene>
  );
}

export default async function HomePage() {
  const signedInRedirectHref = await resolveLandingSignedInRedirectHref();
  if (signedInRedirectHref) {
    redirect(signedInRedirectHref);
  }

  const faqs = await loadPublishedSupportFaqs();
  const jsonLd = buildHomeJsonLd(faqs);
  const { userCount, avatars } = await loadHomeSocialProof();
  const pricingDisplayBenefits = getPlanDisplayBenefits();
  const subscriptionAccessMode = getSubscriptionAccessMode();

  return (
    <>
      <AppPage className="f-landing">
        <FloatingHomeNav />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />

        <div id="home-hero" className="f-landing-hero-shell scroll-mt-24">
          <HeroSection userCount={userCount} avatars={avatars} />
        </div>

        <RevealOnScroll>
          <HairstylePreviewShowcase />
        </RevealOnScroll>

        <RevealOnScroll>
          <FashionDemoShowcase />
        </RevealOnScroll>

        <RevealOnScroll>
          <LandingScene id="home-workflow" number="04" layout="sticky-stage" motion="scroll-progress">
            <div className="f-workflow">
              <div className="f-workflow__intro">
                <SceneHeader
                  eyebrow="How HairFit Works"
                  title="사진 한 장에서 스타일 결정까지"
                  description="업로드, 비교, 선택의 흐름을 따라가면 패션 추천까지 자연스럽게 이어집니다."
                />
                <p className="f-workflow__intro-note" data-reveal-item data-reveal-order="4">
                  Scroll to follow the sequence
                </p>
              </div>
              <ol className="f-workflow__steps">
                {homeWorkflow.map((item, index) => (
                  <li
                    className="f-workflow-step"
                    key={item.step}
                    data-reveal-item
                    data-reveal-order={index + 4}
                  >
                    <span className="f-workflow-step__number" aria-hidden="true">
                      {item.step}
                    </span>
                    <article>
                      <div className="f-workflow-step__media" data-landing-media data-detail-closeup>
                        <Image
                          src={workflowImages[index].src}
                          alt={workflowImages[index].alt}
                          fill
                          className="f-workflow-step__image"
                          sizes="(max-width: 840px) 92vw, 54vw"
                        />
                      </div>
                      <h3 className="f-workflow-step__title">{item.title}</h3>
                      <p className="f-workflow-step__description">{item.description}</p>
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          </LandingScene>
        </RevealOnScroll>

        <RevealOnScroll>
          <FeatureShowcase />
        </RevealOnScroll>

        <RevealOnScroll>
          <LandingScene id="home-criteria" number="06" layout="editorial-split" tone="quiet">
            <SceneHeader
              eyebrow="Recommendation Criteria"
              title="얼굴형만 보지 않고, 전체 스타일을 함께 봅니다"
              description="HairFit은 합성 이미지를 보여주는 데서 끝나지 않고 실제 상담과 패션 선택으로 이어질 기준을 정리합니다."
            />
            <div className="f-criteria">
              <ol className="f-criteria__list">
                {recommendationCriteria.map((item, index) => (
                  <li
                    className="f-criteria__item"
                    key={item.title}
                    data-reveal-item
                    data-reveal-order={index + 4}
                  >
                    <div className="f-criteria__media" data-landing-media data-detail-closeup>
                      <Image
                        src={criteriaImages[index].src}
                        alt={criteriaImages[index].alt}
                        fill
                        className="f-criteria__image"
                        sizes="(max-width: 840px) 92vw, 48vw"
                      />
                    </div>
                    <div className="f-criteria__copy">
                      <span className="f-criteria__index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="f-criteria__title">{item.title}</h3>
                        <p className="f-criteria__description">{item.description}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <Link href="/consulting/new" className="f-landing-cta" data-reveal-item data-reveal-order="8">
                사진 한 장으로 시작하기
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </LandingScene>
        </RevealOnScroll>

        <RevealOnScroll>
          <ReviewCarousel />
        </RevealOnScroll>

        <RevealOnScroll>
          <PricingPreview
            initialDisplayBenefits={pricingDisplayBenefits}
            subscriptionAccessMode={subscriptionAccessMode}
          />
        </RevealOnScroll>

        <RevealOnScroll>
          <LandingScene id="home-faq" number="09" layout="typographic-index">
            <SceneHeader
              eyebrow="FAQ"
              title="시작하기 전에 궁금한 것들"
              description="사진, 결과, 패션 추천과 미용실 상담 활용까지 필요한 답을 모았습니다."
            />
            <FaqShowcase faqs={faqs} />
          </LandingScene>
        </RevealOnScroll>

        <RevealOnScroll>
          <LandingScene id="home-salon" number="10" layout="editorial-split" tone="quiet">
            <div className="f-salon">
              <div
                className="f-salon__media"
                data-landing-media
                data-detail-closeup
                data-reveal-item
                data-reveal-order="1"
              >
                <Image
                  src="/landing/editorial/salon-consultation-tablet-chair.webp"
                  alt="미용실 의자에 앉은 고객과 헤어디자이너가 태블릿의 동일 고객 헤어 후보와 전신 패션 무드를 함께 보며 상담하는 모습"
                  fill
                  className="f-salon__image"
                  sizes="(max-width: 840px) 92vw, 54vw"
                />
              </div>
              <div>
                <SceneHeader
                  eyebrow="Salon Consultation"
                  title="상담도 말보다 이미지로 선명하게"
                  description="고객이 고른 헤어 후보와 패션 무드를 함께 보며 원하는 방향을 더 구체적으로 이야기할 수 있습니다."
                />
                <ol className="f-salon__list">
                  {salonUseCases.map((item, index) => (
                    <li
                      className="f-salon__list-item"
                      key={item}
                      data-reveal-item
                      data-reveal-order={index + 4}
                    >
                      <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      {item}
                    </li>
                  ))}
                </ol>
                <div className="f-salon__actions" data-reveal-item data-reveal-order="7">
                  <Link href="/b2b/signup" className="f-landing-cta">
                    B2B 회원가입
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  <Link href="/b2b/contact" className="f-landing-ghost-cta">
                    도입 문의
                  </Link>
                </div>
              </div>
            </div>
          </LandingScene>
        </RevealOnScroll>

        <RevealOnScroll>
          <FinalCtaBlock />
        </RevealOnScroll>
      </AppPage>
      <MobileStickyCtaBar />
    </>
  );
}
