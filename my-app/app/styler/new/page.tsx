"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import type { FashionMood, FashionOccasion, FashionRecommendation, StyleProfile } from "../../../lib/fashion-types";
import type { GeneratedVariant } from "../../../lib/recommendation-types";

interface ProfileResponse {
  profile?: StyleProfile;
  error?: string;
}

interface RecommendResponse {
  sessionId?: string;
  recommendation?: FashionRecommendation;
  selectedVariant?: GeneratedVariant;
  error?: string;
}

interface GenerateResponse {
  sessionId?: string;
  error?: string;
}

interface GenerationResponse {
  selectedVariant?: GeneratedVariant | null;
  recommendationSet?: {
    variants?: GeneratedVariant[];
  } | null;
  error?: string;
}

type WizardStep = 1 | 2 | 3;

const stepDefinitions: Array<{ id: WizardStep; title: string; eyebrow: string }> = [
  { id: 1, title: "Profile", eyebrow: "Body profile" },
  { id: 2, title: "Style Direction", eyebrow: "Occasion + mood" },
  { id: 3, title: "Preview & Generate", eyebrow: "Outfit preview" },
];

const occasionOptions: Array<{
  value: FashionOccasion;
  label: string;
  description: string;
}> = [
  { value: "daily", label: "Daily", description: "Relaxed balance for repeat wear and clean layering." },
  { value: "work", label: "Work", description: "Sharper proportions with polished structure." },
  { value: "date", label: "Date", description: "Soft contrast and styled details around the face." },
  { value: "formal", label: "Formal", description: "Controlled silhouette with dressier finish." },
];

const moodOptions: Array<{
  value: FashionMood;
  label: string;
  description: string;
}> = [
  { value: "minimal", label: "Minimal", description: "Quiet palette and reduced detail." },
  { value: "trendy", label: "Trendy", description: "Current shapes and stronger visual contrast." },
  { value: "soft", label: "Soft", description: "Gentle color flow and easy drape." },
  { value: "classic", label: "Classic", description: "Timeless structure with stable proportions." },
];

const silhouetteGuide: Record<FashionOccasion, Record<FashionMood, string>> = {
  daily: {
    minimal: "Clean everyday layers with quiet contrast and easy volume.",
    trendy: "Relaxed basics with current shape shifts and stronger silhouette edges.",
    soft: "Comfort-led layering with smooth color transitions around the face.",
    classic: "Stable daily proportions with refined staples that stay easy to wear.",
  },
  work: {
    minimal: "Controlled tailoring with reduced detail and sharp line management.",
    trendy: "Polished structure with a fashion-forward edge in shape or proportion.",
    soft: "Professional frame with less severity and smoother fabric flow.",
    classic: "Reliable office balance built from timeless structured pieces.",
  },
  date: {
    minimal: "Simple, intentional silhouette that keeps focus on face and hair.",
    trendy: "Styled focal points with stronger shape definition and cleaner finish.",
    soft: "Warm texture and softer line movement for a lighter impression.",
    classic: "Balanced dress-up styling with stable, flattering proportions.",
  },
  formal: {
    minimal: "Reduced formal styling with disciplined lines and restrained palette.",
    trendy: "Dress styling with current cuts and a more directional silhouette.",
    soft: "Formal balance with smoother drape and less rigid contrast.",
    classic: "Traditional formal structure with clean, dependable shape control.",
  },
};

function isStepComplete(step: WizardStep, currentStep: WizardStep) {
  return currentStep > step;
}

function StepBadge({
  step,
  currentStep,
  enabled,
  onClick,
}: {
  step: (typeof stepDefinitions)[number];
  currentStep: WizardStep;
  enabled: boolean;
  onClick: (step: WizardStep) => void;
}) {
  const active = currentStep === step.id;
  const complete = isStepComplete(step.id, currentStep);

  return (
    <button
      type="button"
      onClick={() => onClick(step.id)}
      disabled={!enabled}
      className={[
        "rounded-2xl border px-4 py-4 text-left transition",
        active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-900",
        complete && !active ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "",
        !enabled ? "cursor-not-allowed opacity-50" : "hover:border-stone-400",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
            active ? "bg-white/12 text-white" : complete ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700",
          ].join(" ")}
        >
          {complete ? "✓" : step.id}
        </span>
        <div>
          <p className={active ? "text-xs font-bold uppercase tracking-[0.16em] text-white/70" : "text-xs font-bold uppercase tracking-[0.16em] text-stone-400"}>
            {step.eyebrow}
          </p>
          <p className="mt-1 text-base font-semibold">{step.title}</p>
        </div>
      </div>
    </button>
  );
}

function OptionCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: { value: T; label: string; description: string };
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      className={[
        "rounded-2xl border px-4 py-4 text-left transition",
        selected
          ? "border-stone-900 bg-stone-900 text-white shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          : "border-stone-200 bg-white text-stone-900 hover:border-stone-400",
      ].join(" ")}
    >
      <p className={selected ? "text-sm font-bold text-white" : "text-sm font-bold text-stone-900"}>{option.label}</p>
      <p className={selected ? "mt-2 text-sm leading-5 text-white/78" : "mt-2 text-sm leading-5 text-stone-600"}>
        {option.description}
      </p>
    </button>
  );
}

function FieldLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function StylerNewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const generationId = searchParams.get("generationId") || "";
  const selectedVariantId = searchParams.get("variant") || "";

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [occasion, setOccasion] = useState<FashionOccasion>("daily");
  const [mood, setMood] = useState<FashionMood>("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingVariant, setIsLoadingVariant] = useState(true);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoadingProfile(true);
      setProfileError(null);

      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as ProfileResponse;

      if (!active) {
        return;
      }

      if (response.ok && data.profile) {
        setProfile(data.profile);
      } else {
        setProfileError(data.error || "Failed to load style profile.");
      }

      setIsLoadingProfile(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSelectedVariant() {
      if (!generationId || !selectedVariantId) {
        setSelectedVariant(null);
        setIsLoadingVariant(false);
        return;
      }

      setIsLoadingVariant(true);
      setProfileError(null);

      const response = await fetch(`/api/generations/${generationId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as GenerationResponse;

      if (!active) {
        return;
      }

      const variantFromSet =
        data.recommendationSet?.variants?.find((variant) => variant.id === selectedVariantId) || null;

      if (response.ok) {
        setSelectedVariant(variantFromSet || data.selectedVariant || null);
        if (!variantFromSet && !data.selectedVariant) {
          setProfileError("Selected hairstyle could not be found. Go back to the result board and confirm one variant again.");
        }
      } else {
        setProfileError(data.error || "Failed to load confirmed hairstyle.");
      }

      setIsLoadingVariant(false);
    }

    void loadSelectedVariant();

    return () => {
      active = false;
    };
  }, [generationId, selectedVariantId]);

  const profileReady = useMemo(() => {
    return Boolean(
      profile?.heightCm &&
        profile.bodyShape &&
        profile.topSize &&
        profile.bottomSize &&
        profile.fitPreference &&
        profile.exposurePreference &&
        profile.bodyPhotoPath,
    );
  }, [profile]);

  const hasGenerationContext = Boolean(generationId && selectedVariantId);
  const stepOneReady = Boolean(hasGenerationContext && profileReady && selectedVariant);
  const stepThreeReady = Boolean(sessionId && recommendation);
  const visibleStep: WizardStep = !hasGenerationContext || !profileReady ? 1 : currentStep;
  const directionSummary = silhouetteGuide[occasion][mood];

  const clearRecommendationState = () => {
    setSessionId(null);
    setRecommendation(null);
    setRecommendError(null);
    setGenerateError(null);
  };

  const handleOccasionSelect = (value: FashionOccasion) => {
    if (occasion === value) {
      return;
    }
    setOccasion(value);
    clearRecommendationState();
  };

  const handleMoodSelect = (value: FashionMood) => {
    if (mood === value) {
      return;
    }
    setMood(value);
    clearRecommendationState();
  };

  const handleStepChange = (step: WizardStep) => {
    if (step === 1) {
      setCurrentStep(1);
      return;
    }
    if (step === 2 && stepOneReady) {
      setCurrentStep(2);
      return;
    }
    if (step === 3 && stepThreeReady) {
      setCurrentStep(3);
    }
  };

  const handleRecommend = async () => {
    if (!stepOneReady) {
      return;
    }

    setIsRecommending(true);
    setRecommendError(null);
    setGenerateError(null);

    const response = await fetch("/api/styling/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId,
        selectedVariantId,
        occasion,
        mood,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecommendResponse;

    if (response.ok && data.sessionId && data.recommendation) {
      setSessionId(data.sessionId);
      setRecommendation(data.recommendation);
      if (data.selectedVariant) {
        setSelectedVariant(data.selectedVariant);
      }
      setCurrentStep(3);
    } else {
      setRecommendError(data.error || "Failed to build fashion recommendation.");
    }

    setIsRecommending(false);
  };

  const handleGenerate = async () => {
    if (!sessionId) {
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    const response = await fetch("/api/styling/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = (await response.json().catch(() => ({}))) as GenerateResponse;

    if (response.ok) {
      router.push(`/styler/${data.sessionId || sessionId}`);
    } else {
      setGenerateError(data.error || "Failed to generate outfit lookbook image.");
    }

    setIsGenerating(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-20 pt-8 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Fashion Styler</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">Style your confirmed hair with a guided outfit flow</h1>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          Confirm your body profile first, choose the outfit direction, then generate a lookbook image from the saved full-body photo.
        </p>
      </header>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Confirmed Hair</p>
            <p className="text-xl font-bold text-stone-900">
              {isLoadingVariant ? "Loading confirmed hairstyle..." : selectedVariant?.label || "No confirmed hairstyle selected"}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">
              {selectedVariant?.reason ||
                "Open this flow from a completed hairstyle result after choosing the final variant."}
            </p>
          </div>

          <div className="flex w-full gap-4 lg:w-auto">
            <div className="relative aspect-[4/5] w-28 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
              {selectedVariant?.outputUrl ? (
                <img
                  src={selectedVariant.outputUrl}
                  alt={selectedVariant.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-stone-500">
                  Hairstyle preview
                </div>
              )}
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <FieldLabel label="Length" value={selectedVariant?.lengthBucket || "-"} />
              <FieldLabel label="Focus" value={selectedVariant?.correctionFocus || "-"} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {stepDefinitions.map((step) => (
          <StepBadge
            key={step.id}
            step={step}
            currentStep={visibleStep}
            enabled={
              step.id === 1 ||
              (step.id === 2 && stepOneReady) ||
              (step.id === 3 && stepThreeReady)
            }
            onClick={handleStepChange}
          />
        ))}
      </section>

      {visibleStep === 1 ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <FieldLabel label="Height" value={profile?.heightCm ? `${profile.heightCm} cm` : "-"} />
              <FieldLabel label="Body Shape" value={profile?.bodyShape || "-"} />
              <FieldLabel label="Top Size" value={profile?.topSize || "-"} />
              <FieldLabel label="Bottom Size" value={profile?.bottomSize || "-"} />
              <FieldLabel label="Fit Preference" value={profile?.fitPreference || "-"} />
              <FieldLabel label="Body Photo" value={profile?.bodyPhotoPath ? "Saved" : "Missing"} />
            </div>

            <div className="w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Profile Status</p>
                  <p className="mt-1 text-sm font-semibold text-stone-900">
                    {isLoadingProfile ? "Checking profile..." : profileReady ? "Ready for styling" : "Needs setup"}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-bold",
                    profileReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                  ].join(" ")}
                >
                  {profileReady ? "Ready" : "Setup"}
                </span>
              </div>

              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-stone-200 bg-stone-100">
                {profile?.bodyPhotoUrl ? (
                  <img
                    src={profile.bodyPhotoUrl}
                    alt="Saved full body reference"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-stone-500">
                    Save one full-body reference photo in My Page before building an outfit.
                  </div>
                )}
              </div>
            </div>
          </div>

          {!hasGenerationContext ? (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Start from a completed hairstyle result and choose the confirmed variant before opening the fashion styler.
            </p>
          ) : null}

          {profileError ? (
            <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {profileError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {!profileReady ? (
              <Link href="/mypage">
                <Button type="button" variant="secondary">Complete My Profile</Button>
              </Link>
            ) : null}
            <Button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={!stepOneReady || isLoadingProfile || isLoadingVariant}
            >
              Next: Choose Style Direction
            </Button>
          </div>
        </section>
      ) : null}

      {visibleStep === 2 ? (
        <section className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Step 2</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-900">Choose the outfit direction</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Select one occasion and one mood. This step builds the silhouette and styling language before image generation.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900">Occasion</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {occasionOptions.map((option) => (
                <OptionCard
                  key={option.value}
                  option={option}
                  selected={occasion === option.value}
                  onSelect={handleOccasionSelect}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900">Mood</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {moodOptions.map((option) => (
                <OptionCard
                  key={option.value}
                  option={option}
                  selected={mood === option.value}
                  onSelect={handleMoodSelect}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Direction Preview</p>
            <p className="mt-2 text-sm leading-6 text-stone-700">{directionSummary}</p>
          </div>

          {recommendError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {recommendError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setCurrentStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={handleRecommend} disabled={isRecommending || isGenerating}>
              {isRecommending ? "Building..." : "Build Recommendation"}
            </Button>
          </div>
        </section>
      ) : null}

      {visibleStep === 3 ? (
        <section className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Step 3</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-900">
                {recommendation?.headline || "Preview your outfit recommendation"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                {recommendation?.summary ||
                  "Build a recommendation first. This step stays locked until the outfit direction is generated."}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Direction</p>
              <p className="mt-1 text-sm font-semibold text-stone-900">
                {occasionOptions.find((option) => option.value === occasion)?.label} / {moodOptions.find((option) => option.value === mood)?.label}
              </p>
            </div>
          </div>

          {stepThreeReady && recommendation ? (
            <>
              <div className="grid gap-4 lg:grid-cols-[0.62fr_1fr]">
                <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Confirmed Hairstyle</p>
                  <div className="mt-4 flex gap-4">
                    <div className="relative aspect-[4/5] w-28 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      {selectedVariant?.outputUrl ? (
                        <img
                          src={selectedVariant.outputUrl}
                          alt={selectedVariant.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-stone-500">
                          Hair preview
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{selectedVariant?.label || "-"}</p>
                        <p className="mt-1 text-sm leading-6 text-stone-600">{selectedVariant?.reason || "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(selectedVariant?.tags || []).slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FieldLabel label="Silhouette" value={recommendation.silhouette} />
                  <FieldLabel label="Palette" value={recommendation.palette.join(", ")} />
                  <FieldLabel label="Items" value={`${recommendation.items.length} parts`} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {recommendation.items.map((item) => (
                  <article key={item.slot} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">{item.slot}</p>
                    <h3 className="mt-2 text-base font-bold text-stone-900">{item.name}</h3>
                    <p className="mt-2 text-sm leading-5 text-stone-600">{item.description}</p>
                    <p className="mt-3 text-xs text-stone-500">{item.color} | {item.fit} | {item.material}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Styling Notes</p>
                <div className="mt-3 grid gap-2">
                  {recommendation.stylingNotes.map((note) => (
                    <p key={note} className="text-sm leading-6 text-stone-700">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-stone-900">Recommendation is locked</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Go back to Step 2, choose the outfit direction, and build the recommendation first.
              </p>
            </div>
          )}

          {generateError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {generateError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setCurrentStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={!stepThreeReady || isGenerating}>
              {isGenerating ? "Generating Lookbook..." : "Generate Lookbook"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function StylerNewPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12 text-sm text-stone-500">Loading fashion styler...</div>}>
      <StylerNewContent />
    </Suspense>
  );
}
