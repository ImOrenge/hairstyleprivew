import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

type ArchiveSession = { id:string; completed_at:string|null; retention_expires_at:string|null; snapshot:unknown };

function record(value:unknown):Record<string,unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}

function sessionSummary(snapshot:unknown) {
  const source=record(snapshot); const color=record(source.personalColorDiagnosis); const strategy=record(source.strategy);
  const primaryColor=typeof color.primaryType === "string" && color.primaryType.trim() ? color.primaryType : "퍼스널 컬러 결과";
  const direction=typeof strategy.summary === "string" && strategy.summary.trim() ? strategy.summary : "확정한 스타일과 활용 가이드";
  return {primaryColor,direction};
}

export default async function ConsultingArchivePage() {
  const {userId}=await auth();
  if(!userId) return null;
  let sessions:ArchiveSession[]=[]; let hasAnnualArchive=false;
  if(isSupabaseConfigured()) {
    const db=getSupabaseAdminClient();
    const grants=await db.from("customer_entitlement_grants_v2").select("id,status,capability_snapshot")
      .eq("user_id",userId).eq("offering_key","full_style_annual").neq("status","revoked");
    const grantRows=(grants.data??[]) as Array<{id:string;capability_snapshot?:{annualArchive?:boolean}}>;
    hasAnnualArchive=grantRows.some((grant)=>grant.capability_snapshot?.annualArchive===true);
    if(grantRows.length) {
      const result=await db.from("consultation_sessions")
        .select("id,completed_at,retention_expires_at,snapshot")
        .eq("user_id",userId).in("entitlement_grant_id",grantRows.map((grant)=>grant.id))
        .not("completed_at","is",null).order("completed_at",{ascending:false}).limit(12);
      if(!result.error) sessions=(result.data??[]) as ArchiveSession[];
    }
  }
  return <AppPage className="grid gap-5 pb-16">
    <Panel as="header" className="p-5 sm:p-7"><p className="app-kicker">Annual Style Archive</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">연간 스타일 아카이브</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">Signature Style Membership으로 완료한 퍼스널 컬러와 헤어·염색·메이크업·패션 결정을 회차별로 모아 비교합니다. 각 회차에는 30·60·90일 체크인이 제공되고 결과는 완료일부터 365일 보관됩니다.</p></Panel>
    {!hasAnnualArchive?<Panel as="section" className="p-5 sm:p-6"><h2 className="text-xl font-black">Signature Style Membership에서 제공됩니다</h2><p className="mt-2 text-sm text-[var(--app-muted)]">연 4회 결과와 변화 기록, 연간 종합 리포트를 한곳에 보관할 수 있습니다.</p><Link href="/consulting/plans" className="f-landing-cta mt-4 inline-flex">Signature Style Membership 확인</Link></Panel>:null}
    {hasAnnualArchive&&sessions.length<2?<Panel as="section" className="p-5 sm:p-6"><h2 className="text-xl font-black">첫 기록을 쌓고 있어요</h2><p className="mt-2 text-sm text-[var(--app-muted)]">두 번째 상담부터 이전 결과와 변화 흐름을 함께 정리합니다.</p></Panel>:null}
    {hasAnnualArchive&&sessions.length>=2?<Panel as="section" className="p-5 sm:p-6"><p className="app-kicker">연간 종합</p><h2 className="mt-2 text-xl font-black">{sessions.length}회의 스타일 결정을 한 흐름으로 모았습니다</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">가장 최근 결과와 이전 회차를 열어 퍼스널 컬러, 최종 헤어와 실제 활용법이 어떻게 달라졌는지 비교할 수 있습니다.</p></Panel>:null}
    {sessions.length?<section aria-labelledby="archive-list-title" className="grid gap-3"><h2 id="archive-list-title" className="text-xl font-black">회차별 기록</h2>{sessions.map((session,index)=>{const summary=sessionSummary(session.snapshot);return <SurfaceCard as="article" key={session.id} className="grid gap-3 p-5 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center"><div><p className="text-xs font-black text-[var(--app-muted)]">{sessions.length-index}회차</p><p className="mt-1 text-sm font-bold">{session.completed_at?new Date(session.completed_at).toLocaleDateString("ko-KR"):"완료일 확인 중"}</p></div><div><h3 className="font-black">{summary.primaryColor}</h3><p className="mt-1 text-sm text-[var(--app-muted)]">{summary.direction}</p><p className="mt-1 text-xs text-[var(--app-subtle)]">{session.retention_expires_at?`${new Date(session.retention_expires_at).toLocaleDateString("ko-KR")}까지 보관`:"보관일 계산 중"}</p></div><Link href={`/consulting/${encodeURIComponent(session.id)}/result`} className="f-landing-ghost-cta">결과 열기</Link></SurfaceCard>})}</section>:null}
  </AppPage>;
}
