"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import type { FashionRecommendation, StyleProfile } from "../../../lib/fashion-types";
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

const occasionOptions = [
  ["daily", "Daily"],
  ["work", "Work"],
  ["date", "Date"],
  ["formal", "Formal"],
] as const;

const moodOptions = [
  ["minimal", "Minimal"],
  ["trendy", "Trendy"],
  ["soft", "Soft"],
  ["classic", "Classic"],
] as const;

function StylerNewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const generationId = searchParams.get("generationId") || "";
  const selectedVariantId = searchParams.get("variant") || "";

  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [occasion, setOccasion] = useState("daily");
  const [mood, setMood] = useState("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setIsLoadingProfile(true);
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as ProfileResponse;
      if (!active) return;
      if (response.ok && data.profile) {
        setProfile(data.profile);
      } else {
        setError(data.error || "Failed to load style profile.");
      }
      setIsLoadingProfile(false);
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

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

  const canStart = Boolean(generationId && selectedVariantId && profileReady);

  const handleRecommend = async () => {
    setIsRecommending(true);
    setError(null);
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
      setSelectedVariant(data.selectedVariant || null);
    } else {
      setError(data.error || "Failed to build fashion recommendation.");
    }
    setIsRecommending(false);
  };

  const handleGenerate = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    setError(null);
    const response = await fetch("/api/styling/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = (await response.json().catch(() => ({}))) as GenerateResponse;
    if (response.ok) {
      router.push(`/styler/${data.sessionId || sessionId}`);
    } else {
      setError(data.error || "Failed to generate outfit lookbook image.");
    }
    setIsGenerating(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-20 pt-8 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Fashion Styler</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">Build an outfit for your confirmed hair</h1>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          This creates a lookbook-style outfit image based on your saved body profile, full-body reference photo, and selected hairstyle. It is not an exact virtual fitting.
        </p>
      </header>

      {!generationId || !selectedVariantId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Start from a completed hairstyle result and select a variant before opening the fashion styler.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Profile readiness</h2>
            <p className="mt-1 text-sm text-stone-600">
              {isLoadingProfile
                ? "Checking your saved style profile..."
                : profileReady
                  ? "Your body profile and reference photo are ready."
                  : "Complete your body profile and full-body photo in My Page first."}
            </p>
          </div>

          <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-700">
            <p>Height: <strong>{profile?.heightCm ? `${profile.heightCm}cm` : "-"}</strong></p>
            <p>Body shape: <strong>{profile?.bodyShape || "-"}</strong></p>
            <p>Top / bottom: <strong>{profile?.topSize || "-"} / {profile?.bottomSize || "-"}</strong></p>
            <p>Full-body photo: <strong>{profile?.bodyPhotoPath ? "Saved" : "Missing"}</strong></p>
          </div>

          {!profileReady ? (
            <Link href="/mypage">
              <Button type="button" variant="secondary">Complete My Profile</Button>
            </Link>
          ) : null}
        </div>

        <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              Occasion
              <select
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {occasionOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              Mood
              <select
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {moodOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleRecommend} disabled={!canStart || isRecommending || isGenerating}>
              {isRecommending ? "Building..." : "Recommend Outfit"}
            </Button>
            {recommendation && sessionId ? (
              <Button type="button" variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating Lookbook..." : "Generate Lookbook Image"}
              </Button>
            ) : null}
          </div>

          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

          {selectedVariant ? (
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Confirmed Hairstyle</p>
              <p className="mt-1 text-sm font-semibold text-stone-900">{selectedVariant.label}</p>
            </div>
          ) : null}
        </div>
      </section>

      {recommendation ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Recommendation Preview</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">{recommendation.headline}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{recommendation.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {recommendation.items.map((item) => (
              <article key={item.slot} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">{item.slot}</p>
                <h3 className="mt-2 text-base font-bold text-stone-900">{item.name}</h3>
                <p className="mt-2 text-sm leading-5 text-stone-600">{item.description}</p>
                <p className="mt-3 text-xs text-stone-500">{item.color} | {item.fit}</p>
              </article>
            ))}
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
