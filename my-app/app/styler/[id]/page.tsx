"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import type { FashionRecommendation } from "../../../lib/fashion-types";

interface StylingSessionDetails {
  id: string;
  generationId: string;
  selectedVariantId: string;
  occasion: string;
  mood: string;
  recommendation: FashionRecommendation;
  status: string;
  errorMessage: string | null;
  creditsUsed: number;
  imageUrl: string | null;
  createdAt: string;
}

interface StylingDetailsResponse {
  session?: StylingSessionDetails;
  error?: string;
}

export default function StylerResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [session, setSession] = useState<StylingSessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const response = await fetch(`/api/styling/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as StylingDetailsResponse;
      if (!active) return;

      if (response.ok && data.session) {
        setSession(data.session);
        setError(null);
      } else {
        setError(data.error || "Failed to load styling session.");
      }
      setIsLoading(false);
    }

    if (id) {
      void loadSession();
    }

    return () => {
      active = false;
    };
  }, [id]);

  const recommendation = session?.recommendation || null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-20 pt-8 sm:px-6">
      <header className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Fashion Lookbook</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">
          {recommendation?.headline || "Styling Result"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-stone-600">
          Lookbook-style outfit image based on your selected hairstyle and saved body profile. This is not an exact virtual fitting.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-2xl bg-stone-50 p-6 text-center text-sm text-stone-500">Loading styling result...</div>
      ) : null}
      {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</div> : null}

      {session ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
            <div className="aspect-[3/4]">
              {session.imageUrl ? (
                <img src={session.imageUrl} alt="Generated outfit lookbook" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  Outfit image is not available. Status: {session.status}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Styling Summary</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">{recommendation?.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(recommendation?.palette || []).map((color) => (
                  <span key={color} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                    {color}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-stone-500">
                Occasion: {session.occasion} | Mood: {session.mood} | Credits used: {session.creditsUsed}
              </p>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Styling Notes</p>
              <div className="mt-3 grid gap-2">
                {(recommendation?.stylingNotes || []).map((note) => (
                  <p key={note} className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">{note}</p>
                ))}
              </div>
            </section>

            <Link href={`/result/${session.generationId}?variant=${encodeURIComponent(session.selectedVariantId)}`}>
              <Button type="button" variant="secondary">Back to Hair Result</Button>
            </Link>
          </aside>
        </section>
      ) : null}

      {recommendation ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Item Slots</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">Recommended fashion items</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {recommendation.items.map((item) => (
              <article key={item.slot} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">{item.slot}</p>
                <h3 className="mt-2 text-base font-bold text-stone-900">{item.name}</h3>
                <p className="mt-2 text-sm leading-5 text-stone-600">{item.description}</p>
                <dl className="mt-3 grid gap-1 text-xs text-stone-500">
                  <div>Color: {item.color}</div>
                  <div>Fit: {item.fit}</div>
                  <div>Material: {item.material}</div>
                  <div>Brand: {item.brandName || "Reserved for brand integration"}</div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
