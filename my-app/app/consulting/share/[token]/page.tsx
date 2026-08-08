/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBriefActions } from "../../../../components/consulting/brief/PublicBriefActions";
import { Panel, SurfaceCard } from "../../../../components/ui/Surface";
import { readPublicConsultationShare } from "../../../../lib/consulting/share-server";

export const metadata: Metadata = { title: "살롱 브리프", robots: { index: false, follow: false } };
interface Props { params: Promise<{ token: string }> }
export default async function PublicConsultationBriefPage({ params }: Props) {
  const share = await readPublicConsultationShare((await params).token);
  if (!share) notFound();
  return <div className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="app-kicker">HairFit Salon Brief</p><h1 className="mt-3 text-3xl font-black">{share.style.label}</h1><p className="mt-2 text-xs text-[var(--app-muted)]">공유 만료 · {new Date(share.expiresAt).toLocaleString("ko-KR")}</p></div><PublicBriefActions /></div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">{share.style.imageUrl ? <Panel className="overflow-hidden"><div className="aspect-[4/5] bg-[var(--app-surface-muted)]"><img src={share.style.imageUrl} alt={share.style.label} className="h-full w-full object-cover" decoding="async" loading="eager" /></div></Panel> : null}<Panel className="grid gap-5 p-5 sm:p-7"><p className="text-sm leading-7">{share.brief.summary}</p>{[["커트 방향",share.brief.cut],["볼륨·질감",share.brief.volumeTexture],["스타일링",share.brief.styling],["실현 가능성",share.style.feasibility]].map(([label,value]) => <SurfaceCard key={label} className="p-4"><p className="app-kicker">{label}</p><p className="mt-2 text-sm leading-6">{value}</p></SurfaceCard>)}<p className="text-xs leading-5 text-[var(--app-muted)]">이 공유 자료에는 원본 얼굴 사진과 전체 분석 스냅샷이 포함되지 않습니다. 최종 시술은 현장에서 모발 상태를 확인한 뒤 결정하세요.</p></Panel></div>
  </div>;
}
