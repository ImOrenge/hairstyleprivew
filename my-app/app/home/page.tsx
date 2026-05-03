import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Grid3X3,
  ImagePlus,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import {
  loadCustomerHomeDashboard,
  type CustomerHomeDashboard,
  type CustomerHomeGeneration,
  type CustomerHomeStylingSession,
} from "../../lib/customer-home-data";
import { isAccountType, parseOnboardingMetadata } from "../../lib/onboarding";
import { getActivePlan } from "../../lib/plan-entitlements";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "../../lib/style-profile-server";

interface UserRow {
  account_type?: string | null;
  onboarding_completed_at?: string | null;
  credits?: number | null;
  display_name?: string | null;
  email?: string | null;
}

const emptyDashboard: CustomerHomeDashboard = {
  credits: 0,
  planKey: null,
  styleProfileReady: false,
  recentGenerations: [],
  recentPayments: [],
  recentStylingSessions: [],
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "완료";
  if (status === "failed" || status === "error") return "실패";
  if (status === "processing" || status === "running" || status === "generating") return "생성 중";
  if (status === "queued" || status === "pending" || status === "recommended") return "준비됨";
  return value || "확인 중";
}

function statusClassName(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (status === "failed" || status === "error") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (status === "processing" || status === "running" || status === "generating") {
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] ring-1 ring-[var(--app-accent)]";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-muted)] ring-1 ring-[var(--app-border)]";
}

function genreLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    minimal: "미니멀",
    street: "스트릿",
    casual: "캐주얼",
    classic: "클래식",
    office: "오피스",
    date: "데이트",
    formal: "포멀",
    athleisure: "애슬레저",
  };
  return value ? labels[value] ?? value : "스타일";
}

function generationHref(item: CustomerHomeGeneration) {
  if (item.selectedVariantId) {
    return `/result/${item.id}?variant=${encodeURIComponent(item.selectedVariantId)}`;
  }
  return `/generate/${item.id}`;
}

function stylingHref(item: CustomerHomeStylingSession) {
  return `/styler/${item.id}`;
}

function findSelectedHair(dashboard: CustomerHomeDashboard) {
  return dashboard.recentGenerations.find(
    (item) => item.selectedVariantId && item.status.toLowerCase() === "completed",
  ) ?? dashboard.recentGenerations.find((item) => item.selectedVariantId) ?? null;
}

function buildCta(dashboard: CustomerHomeDashboard) {
  const completedStyling = dashboard.recentStylingSessions.find((item) => item.status === "completed");
  if (completedStyling) {
    return {
      eyebrow: "최근 스타일 추천",
      title: "최근 스타일 추천 보기",
      description: completedStyling.headline || "완성된 룩북과 추천 코디를 다시 확인하세요.",
      href: stylingHref(completedStyling),
      icon: Shirt,
    };
  }

  const selectedHair = findSelectedHair(dashboard);
  if (selectedHair?.selectedVariantId) {
    return {
      eyebrow: "다음 단계",
      title: "이 헤어로 패션 추천 시작",
      description: selectedHair.selectedVariantLabel || "선택한 헤어에 맞춘 코디 방향을 이어서 만드세요.",
      href: `/styler/new?generationId=${encodeURIComponent(selectedHair.id)}&variant=${encodeURIComponent(selectedHair.selectedVariantId)}`,
      icon: Sparkles,
    };
  }

  return {
    eyebrow: "새 작업",
    title: "새 헤어 만들기",
    description: "정면 사진 한 장으로 3x3 헤어 추천 보드를 시작하세요.",
    href: "/workspace",
    icon: Grid3X3,
  };
}

function PreviewFrame({
  alt,
  aspect = "aspect-[4/5]",
  src,
}: {
  alt: string;
  aspect?: string;
  src: string | null;
}) {
  return (
    <div className={`relative overflow-hidden bg-[var(--app-surface-muted)] ${aspect}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[var(--app-muted)]">
          이미지 준비 중
        </div>
      )}
    </div>
  );
}

function MetricCard({
  helper,
  icon: Icon,
  label,
  value,
}: {
  helper: string;
  icon: typeof CreditCard;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.08em] text-[var(--app-muted)]">
          {label}
        </p>
        <Icon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" aria-hidden="true" />
      </div>
      <p className="mt-1 truncate text-xl font-black text-[var(--app-text)] sm:text-2xl">{value}</p>
      <p className="mt-1 hidden truncate text-xs leading-5 text-[var(--app-muted)] sm:block">{helper}</p>
    </div>
  );
}

function EmptyCard({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <SurfaceCard className="border-dashed px-5 py-8 text-center">
      <p className="text-sm font-black text-[var(--app-text)]">{title}</p>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </SurfaceCard>
  );
}

async function loadDashboard(userId: string) {
  const clerkUser = await currentUser();
  const metadata = parseOnboardingMetadata(clerkUser?.publicMetadata);
  let userRow: UserRow | null = null;
  let dashboard = emptyDashboard;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const ensured = await ensureCurrentUserProfile(userId, supabase as unknown as ServerSupabaseLike);
    if (ensured.error) {
      throw new Error(ensured.error.message);
    }

    const { data, error } = await supabase
      .from("users")
      .select("account_type,onboarding_completed_at,credits,display_name,email")
      .eq("id", userId)
      .maybeSingle<UserRow>();

    if (error) {
      throw new Error(error.message);
    }

    userRow = data;
    const planKey = await getActivePlan(supabase as never, userId);
    dashboard = await loadCustomerHomeDashboard(supabase as never, userId, {
      credits: Number.isInteger(data?.credits) ? Number(data?.credits) : 0,
      planKey,
    });
  }

  const dbAccountType = isAccountType(userRow?.account_type) ? userRow.account_type : null;
  const accountType = dbAccountType ?? metadata.accountType;
  const onboardingComplete =
    accountType === "admin" ||
    Boolean(userRow?.onboarding_completed_at && accountType) ||
    Boolean(metadata.onboardingComplete && accountType);

  if (!onboardingComplete || !accountType) {
    redirect("/onboarding?return_url=/home");
  }
  if (accountType === "salon_owner") {
    redirect("/salon/customers");
  }
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    userRow?.email ||
    "";
  const viewerName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    userRow?.display_name ||
    email.split("@")[0] ||
    "HairFit 사용자";

  return { dashboard, viewerName };
}

export default async function CustomerHomePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/home"));
  }

  const { dashboard, viewerName } = await loadDashboard(userId);
  const secondaryCta = buildCta(dashboard);
  const showSecondaryCta = secondaryCta.href !== "/workspace";
  const CtaIcon = ImagePlus;
  const hairItems = dashboard.recentGenerations.slice(0, 3);
  const stylingItems = dashboard.recentStylingSessions.slice(0, 3);
  const selectedHair = findSelectedHair(dashboard);
  const styleEmptyHref = selectedHair?.selectedVariantId
    ? `/styler/new?generationId=${encodeURIComponent(selectedHair.id)}&variant=${encodeURIComponent(selectedHair.selectedVariantId)}`
    : "/workspace";

  return (
    <AppPage className="flex flex-col gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="app-kicker">App Home</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              {viewerName}님의 스타일 홈
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              헤어 생성 기록과 패션 추천 기록을 이어서 확인하고, 다음 스타일 작업을 바로 시작하세요.
            </p>
          </div>
        </div>
      </Panel>

      <Panel as="section" className="overflow-hidden p-0">
        <div className="grid grid-cols-3 divide-x divide-[var(--app-border)]">
          <MetricCard
            helper="헤어와 룩북 생성에 사용됩니다"
            icon={CreditCard}
            label="크레딧"
            value={dashboard.credits.toLocaleString("ko-KR")}
          />
          <MetricCard
            helper={dashboard.planKey ? "현재 활성 플랜" : "활성 구독 정보 없음"}
            icon={Sparkles}
            label="플랜"
            value={dashboard.planKey || "free"}
          />
          <MetricCard
            helper={dashboard.styleProfileReady ? "패션 추천 준비 완료" : "패션 추천 전 바디 프로필 필요"}
            icon={UserRound}
            label="바디 프로필"
            value={dashboard.styleProfileReady ? "준비됨" : "필요"}
          />
        </div>
      </Panel>

      <Panel as="section" className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex min-h-64 flex-col justify-between bg-[var(--app-inverse)] p-5 text-[var(--app-inverse-text)] sm:p-6">
            <div>
              <p className="app-inverse-kicker">헤어스타일 생성</p>
              <h2 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">사진 업로드로 새 헤어 만들기</h2>
              <p className="app-inverse-muted mt-3 max-w-xl text-sm leading-6 sm:text-base">
                정면 사진 한 장으로 3x3 헤어 추천 보드를 바로 시작하세요.
              </p>
            </div>
            <Link
              href="/workspace"
              className="app-inverse-cta mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] transition sm:w-auto"
            >
              사진 업로드
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/personal-color?source=upload&returnTo=%2Fworkspace&nextStep=generate"
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-white/15 sm:w-auto"
            >
              퍼스널컬러 진단
            </Link>
            {showSecondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-white/15 sm:w-auto"
              >
                {secondaryCta.title}
              </Link>
            ) : null}
          </div>
          <div className="grid content-center gap-4 p-5 sm:p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
              <CtaIcon className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-black text-[var(--app-muted)]">헤어 기록</p>
                <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{dashboard.recentGenerations.length}</p>
              </SurfaceCard>
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-black text-[var(--app-muted)]">스타일 기록</p>
                <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{dashboard.recentStylingSessions.length}</p>
              </SurfaceCard>
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-black text-[var(--app-muted)]">최근 결제</p>
                <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{dashboard.recentPayments.length}</p>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel as="section" className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="app-kicker">Hair History</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">헤어 생성 기록</h2>
            </div>
            <Link href="/mypage?tab=usage" className="text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
              전체 보기
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {hairItems.length === 0 ? (
              <EmptyCard href="/workspace" label="새 헤어 만들기" title="아직 헤어 생성 기록이 없습니다." />
            ) : (
              hairItems.map((item) => (
                <Link
                  key={item.id}
                  href={generationHref(item)}
                  className="app-card grid gap-3 overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)] sm:grid-cols-[8rem_minmax(0,1fr)]"
                >
                  <PreviewFrame alt={item.selectedVariantLabel || "헤어 생성 결과"} src={item.selectedVariantImageUrl} />
                  <div className="min-w-0 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-[var(--app-radius-control)] px-2.5 py-1 text-xs font-bold ${statusClassName(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      <span className="text-xs font-semibold text-[var(--app-muted)]">{formatDate(item.createdAt)}</span>
                    </div>
                    <h3 className="mt-3 truncate text-base font-black text-[var(--app-text)]">
                      {item.selectedVariantLabel || "3x3 헤어 추천 보드"}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                      완료 후보 {item.completedVariantCount}/{item.totalVariantCount || 9}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel as="section" className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="app-kicker">Style History</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">스타일 추천 기록</h2>
            </div>
            <Link href="/styler/new" className="text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
              새 추천
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {stylingItems.length === 0 ? (
              <EmptyCard
                href={styleEmptyHref}
                label={selectedHair ? "패션 추천 시작" : "헤어 생성 먼저 시작"}
                title="아직 스타일 추천 기록이 없습니다."
              />
            ) : (
              stylingItems.map((item) => (
                <Link
                  key={item.id}
                  href={stylingHref(item)}
                  className="app-card grid gap-3 overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)] sm:grid-cols-[8rem_minmax(0,1fr)]"
                >
                  <PreviewFrame alt={item.headline || "스타일 추천 결과"} aspect="aspect-[3/4]" src={item.imageUrl} />
                  <div className="min-w-0 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-[var(--app-radius-control)] px-2.5 py-1 text-xs font-bold ${statusClassName(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      <span className="text-xs font-semibold text-[var(--app-muted)]">{genreLabel(item.genre)}</span>
                    </div>
                    <h3 className="mt-3 line-clamp-1 text-base font-black text-[var(--app-text)]">
                      {item.headline || "패션 추천"}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">
                      {item.summary || `${formatDate(item.createdAt)} 생성`}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>
      </section>

      <SurfaceCard className="flex items-start gap-3 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          홈에는 최근 3개씩만 표시됩니다. 전체 사용 기록과 결제 정보는 마이페이지에서 확인할 수 있습니다.
        </p>
        <Clock3 className="ml-auto hidden h-5 w-5 shrink-0 text-[var(--app-subtle)] sm:block" aria-hidden="true" />
      </SurfaceCard>
    </AppPage>
  );
}
