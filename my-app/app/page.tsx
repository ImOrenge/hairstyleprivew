import dynamic from "next/dynamic";
import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { FashionDemoShowcase } from "../components/home/FashionDemoShowcase";
import { HeroSection } from "../components/home/HeroSection";

const PricingPreview = dynamic(() => import("../components/home/PricingPreview").then(mod => mod.PricingPreview), {
  loading: () => <div className="h-96 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

const ReviewCarousel = dynamic(() => import("../components/home/ReviewCarousel").then(mod => mod.ReviewCarousel), {
  loading: () => <div className="h-64 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-800" />,
});

export default async function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:gap-10 sm:py-12">
      <HeroSection />
      <FashionDemoShowcase />
      <FeatureShowcase />
      <PricingPreview />
      <ReviewCarousel />
    </div>
  );
}
