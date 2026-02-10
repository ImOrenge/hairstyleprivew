import { FeatureShowcase } from "../components/home/FeatureShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { PricingPreview } from "../components/home/PricingPreview";
import { ReviewCarousel } from "../components/home/ReviewCarousel";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:py-10">
      <HeroSection />
      <FeatureShowcase />
      <PricingPreview />
      <ReviewCarousel />
    </div>
  );
}
