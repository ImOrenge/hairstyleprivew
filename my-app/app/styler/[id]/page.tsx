"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { AppPage, SurfaceCard } from "../../../components/ui/Surface";
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
    <AppPage className="flex flex-col gap-6 pb-20 pt-8">
      <header className="space-y-2 text-center">
        <p className="app-kicker">패션 룩북</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">
          {recommendation?.headline || "패션 추천 결과"}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          선택한 헤어스타일과 저장된 바디 프로필을 바탕으로 만든 전신 코디 이미지입니다. 실제 피팅을 보장하는 가상 착장은 아니며, 스타일 방향을 확인하기 위한 룩북입니다.
        </p>
      </header>

      {isLoading ? (
        <SurfaceCard className="p-6 text-center text-sm text-[var(--app-muted)]">패션 결과를 불러오는 중입니다...</SurfaceCard>
      ) : null}
      {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</div> : null}

      {session ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <SurfaceCard className="overflow-hidden p-0">
            <div className="aspect-[3/4]">
              {session.imageUrl ? (
                <img src={session.imageUrl} alt="생성된 패션 룩북 이미지" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  룩북 이미지를 아직 사용할 수 없습니다. 현재 상태: {formatStatus(session.status)}
                </div>
              )}
            </div>
          </SurfaceCard>

          <aside className="space-y-4">
            <SurfaceCard as="section" className="p-5">
              <p className="app-kicker">추천 요약</p>
              <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">{recommendation?.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(recommendation?.palette || []).map((color) => (
                  <span key={color} className="app-chip px-3 py-1 text-xs font-medium">
                    {color}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--app-muted)]">
                장르: {genre ? genreLabelMap[genre] : session.occasion} · 상태: {formatStatus(session.status)} · 사용 크레딧: {session.creditsUsed}
              </p>
            </SurfaceCard>

            <SurfaceCard as="section" className="p-5">
              <p className="app-kicker">스타일링 메모</p>
              <div className="mt-3 grid gap-2">
                {(recommendation?.stylingNotes || []).map((note) => (
                  <p key={note} className="app-card px-3 py-2 text-sm text-[var(--app-text)]">{note}</p>
                ))}
              </div>
            </SurfaceCard>

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
            <p className="app-kicker">추천 아이템</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">코디 구성</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {recommendation.items.map((item) => (
              <SurfaceCard as="article" key={item.slot} className="p-4">
                <p className="app-kicker">{item.slot}</p>
                <h3 className="mt-2 text-base font-bold text-[var(--app-text)]">{item.name}</h3>
                <p className="mt-2 text-sm leading-5 text-[var(--app-muted)]">{item.description}</p>
                <dl className="mt-3 grid gap-1 text-xs text-[var(--app-subtle)]">
                  <div>색상: {item.color}</div>
                  <div>핏: {item.fit}</div>
                  <div>소재: {item.material}</div>
                  <div>브랜드: {item.brandName || "브랜드 연동 예정"}</div>
                </dl>
              </SurfaceCard>
            ))}
          </div>
        </section>
      ) : null}
    </AppPage>
  );
}
