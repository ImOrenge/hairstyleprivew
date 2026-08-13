import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { HeroSection } from "../components/home/HeroSection";
import { MobileStickyCtaBar } from "../components/home/MobileStickyCtaBar";
import {
  AftercareTimelineShowcase,
  AnalysisEvidenceShowcase,
  CompareDecisionShowcase,
  DirectionShowcase,
  FashionDirectionShowcase,
  SalonBriefShowcase,
  StrategicPreviewShowcase,
  StyleDossierShowcase,
  TrustAndFinalCta,
} from "../components/home/PremiumConsultingShowcases";
import { RevealOnScroll } from "../components/home/RevealOnScroll";
import { AppPage } from "../components/ui/Surface";
import { resolveSignedInAccountHomeHref } from "../lib/account-home-server";
import { getClerkConfigState } from "../lib/clerk";
import { homeNavItems, homeSeo, structuredDataName } from "../lib/home-content";
import { getPlanDisplayBenefits } from "../lib/plan-benefit-display";
import { getSiteUrl } from "../lib/site-url";
import { getSubscriptionAccessMode } from "../lib/subscription-access";
import { loadPublishedSupportFaqs } from "../lib/support-server";
import Link from "next/link";

const PricingPreview = nextDynamic(
  () => import("../components/home/PricingPreview").then((mod) => mod.PricingPreview),
  { loading: () => <div className="f-landing-skeleton h-96 animate-pulse" /> },
);

const siteUrl = getSiteUrl();
export const dynamic = "force-dynamic";

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
    images: [{ url: "/hero/fashion-demo/lookbook-board.png", width: 1200, height: 630, alt: "HairFit 프라이빗 AI 스타일 컨설팅" }],
  },
  twitter: { card: "summary_large_image", title: homeSeo.title, description: homeSeo.description, images: ["/hero/fashion-demo/lookbook-board.png"] },
};

async function resolveLandingSignedInRedirectHref() {
  if (!getClerkConfigState().canUseClerkServer) return null;
  try {
    const { userId } = await auth();
    return userId ? await resolveSignedInAccountHomeHref(userId) : null;
  } catch (error) {
    console.error("[landing] Failed to resolve signed-in redirect:", error);
    return null;
  }
}

function FloatingHomeNav() {
  return (
    <nav className="f-landing-floating-nav" aria-label="랜딩페이지 섹션 바로가기">
      <ul className="f-landing-floating-nav__list">
        {homeNavItems.map((item) => <li key={item.href}><Link className="f-landing-floating-nav__link" href={item.href}><span aria-hidden="true">{item.shortLabel}</span><span className="f-landing-floating-nav__label" aria-hidden="true">{item.label}</span><span className="sr-only">{item.label}</span></Link></li>)}
      </ul>
    </nav>
  );
}

function buildHomeJsonLd(faqs: Array<{ question: string; answer: string }>) {
  return [
    { "@context": "https://schema.org", "@type": "WebApplication", name: structuredDataName, url: siteUrl, applicationCategory: "LifestyleApplication", operatingSystem: "Web", inLanguage: "ko-KR", description: homeSeo.description },
    { "@context": "https://schema.org", "@type": "Organization", name: structuredDataName, url: siteUrl, logo: `${siteUrl}/logo.png` },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
  ];
}

export default async function HomePage() {
  const signedInRedirectHref = await resolveLandingSignedInRedirectHref();
  if (signedInRedirectHref) redirect(signedInRedirectHref);

  const faqs = await loadPublishedSupportFaqs();
  const jsonLd = buildHomeJsonLd(faqs);
  const pricingDisplayBenefits = getPlanDisplayBenefits();
  const subscriptionAccessMode = getSubscriptionAccessMode();

  return (
    <>
      <AppPage className="f-landing">
        <FloatingHomeNav />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <div id="home-hero" className="f-landing-hero-shell scroll-mt-24"><HeroSection /></div>
        <RevealOnScroll><AnalysisEvidenceShowcase /></RevealOnScroll>
        <RevealOnScroll><DirectionShowcase /></RevealOnScroll>
        <RevealOnScroll><StrategicPreviewShowcase /></RevealOnScroll>
        <RevealOnScroll><CompareDecisionShowcase /></RevealOnScroll>
        <RevealOnScroll><SalonBriefShowcase /></RevealOnScroll>
        <RevealOnScroll><AftercareTimelineShowcase /></RevealOnScroll>
        <RevealOnScroll><FashionDirectionShowcase /></RevealOnScroll>
        <RevealOnScroll><StyleDossierShowcase /></RevealOnScroll>
        <RevealOnScroll><PricingPreview initialDisplayBenefits={pricingDisplayBenefits} subscriptionAccessMode={subscriptionAccessMode} /></RevealOnScroll>
        <RevealOnScroll><TrustAndFinalCta faqs={faqs} /></RevealOnScroll>
      </AppPage>
      <MobileStickyCtaBar />
    </>
  );
}
