"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import type { FashionGenre, FashionRecommendation } from "../../../lib/fashion-types";

interface StylingSessionDetails {
  id: string;
  generationId: string;
  selectedVariantId: string;
  genre: FashionGenre | null;
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

const genreLabelMap: Record<FashionGenre, string> = {
  minimal: "미니멀",
  street: "스트릿",
  casual: "캐주얼",
  classic: "클래식",
  office: "오피스",
  date: "데이트",
  formal: "포멀",
  athleisure: "애슬레저",
};

function formatStatus(status: string) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "recommended") return "추천 완료";
  if (status === "failed") return "실패";
  return status;
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
        setError(data.error || "패션 추천 결과를 불러오지 못했습니다.");
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
  const genre = session?.genre || recommendation?.genre || null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-20 pt-8 sm:px-6">
      <header className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase text-stone-400">패션 룩북</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">
          {recommendation?.headline || "패션 추천 결과"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-stone-600">
          선택한 헤어스타일과 저장된 바디 프로필을 바탕으로 만든 전신 코디 이미지입니다. 실제 피팅을 보장하는 가상 착장은 아니며, 스타일 방향을 확인하기 위한 룩북입니다.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-2xl bg-stone-50 p-6 text-center text-sm text-stone-500">패션 결과를 불러오는 중입니다...</div>
      ) : null}
      {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</div> : null}

      {session ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
            <div className="aspect-[3/4]">
              {session.imageUrl ? (
                <img src={session.imageUrl} alt="생성된 패션 룩북 이미지" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  룩북 이미지를 아직 사용할 수 없습니다. 현재 상태: {formatStatus(session.status)}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase text-stone-400">추천 요약</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">{recommendation?.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(recommendation?.palette || []).map((color) => (
                  <span key={color} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                    {color}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-stone-500">
                장르: {genre ? genreLabelMap[genre] : session.occasion} · 상태: {formatStatus(session.status)} · 사용 크레딧: {session.creditsUsed}
              </p>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase text-stone-400">스타일링 메모</p>
              <div className="mt-3 grid gap-2">
                {(recommendation?.stylingNotes || []).map((note) => (
                  <p key={note} className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">{note}</p>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <Link href={`/result/${session.generationId}?variant=${encodeURIComponent(session.selectedVariantId)}`}>
                <Button type="button" variant="secondary">헤어 결과로 돌아가기</Button>
              </Link>
              <Link href="/styler/new">
                <Button type="button" variant="secondary">새 패션 추천 만들기</Button>
              </Link>
            </div>
          </aside>
        </section>
      ) : null}

      {recommendation ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase text-stone-400">추천 아이템</p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">코디 구성</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {recommendation.items.map((item) => (
              <article key={item.slot} className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-stone-400">{item.slot}</p>
                <h3 className="mt-2 text-base font-bold text-stone-900">{item.name}</h3>
                <p className="mt-2 text-sm leading-5 text-stone-600">{item.description}</p>
                <dl className="mt-3 grid gap-1 text-xs text-stone-500">
                  <div>색상: {item.color}</div>
                  <div>핏: {item.fit}</div>
                  <div>소재: {item.material}</div>
                  <div>브랜드: {item.brandName || "브랜드 연동 예정"}</div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
