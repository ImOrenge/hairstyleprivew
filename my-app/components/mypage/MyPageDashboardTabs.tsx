import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CreditCard,
  Scissors,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";
import { getCreditsPerStyle } from "../../lib/pricing-plan";
import { AppPage, Panel, SurfaceCard } from "../ui/Surface";
import { StyleProfileForm } from "./StyleProfileForm";

export type MyPageTabId = "usage" | "plan" | "aftercare" | "body-profile" | "account";

export interface UserProfileRow {
  credits?: number | null;
  display_name?: string | null;
}

export interface PaymentTransactionRow {
  id: string;
  status: string | null;
  amount: number | null;
  credits_to_grant: number | null;
  paid_at: string | null;
  created_at: string;
  metadata?: unknown;
}

export interface GenerationRow {
  id: string;
  created_at: string;
  prompt_used: string | null;
  status: string | null;
  credits_used: number | null;
}

export interface UserStyleProfileRow {
  height_cm?: number | null;
  body_shape?: string | null;
  top_size?: string | null;
  bottom_size?: string | null;
  fit_preference?: string | null;
  exposure_preference?: string | null;
  body_photo_path?: string | null;
}

export interface HairRecordRow {
  id: string;
  style_name: string | null;
  service_type: string | null;
  service_date: string | null;
  next_visit_target_days: number | null;
  created_at: string;
}

export interface SubscriptionRow {
  plan_key: string | null;
  status: string | null;
  current_period_end: string | null;
}

interface QueryState {
  checkoutId: string;
  payment: string;
  subscribed: string;
}

interface MyPageDashboardTabsProps {
  activeTab: MyPageTabId;
  email: string;
  generations: GenerationRow[];
  hairRecords: HairRecordRow[];
  payments: PaymentTransactionRow[];
  profile: UserProfileRow | null;
  queryState: QueryState;
  styleProfile: UserStyleProfileRow | null;
  subscription: SubscriptionRow | null;
  viewerName: string;
}

const tabIds: MyPageTabId[] = ["usage", "plan", "aftercare", "body-profile", "account"];

const tabs: Array<{
  description: string;
  icon: typeof Activity;
  id: MyPageTabId;
  label: string;
}> = [
  {
    id: "usage",
    label: "사용기록",
    description: "최근 생성 기록",
    icon: Activity,
  },
  {
    id: "plan",
    label: "플랜/결제",
    description: "구독과 결제",
    icon: CreditCard,
  },
  {
    id: "aftercare",
    label: "에프터케어",
    description: "시술 기록",
    icon: Scissors,
  },
  {
    id: "body-profile",
    label: "바디프로필",
    description: "패션 추천 설정",
    icon: Shirt,
  },
  {
    id: "account",
    label: "계정",
    description: "기본 정보",
    icon: UserRound,
  },
];

export function normalizeMyPageTab(value: string | null | undefined): MyPageTabId {
  return tabIds.includes(value as MyPageTabId) ? (value as MyPageTabId) : "usage";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPlanFromMetadata(metadata: unknown): string | null {
  if (!isRecord(metadata) || typeof metadata.plan !== "string") {
    return null;
  }
  return metadata.plan.trim().toLowerCase() || null;
}

function isActiveSubscription(subscription: SubscriptionRow | null) {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  if (!subscription.current_period_end) return true;

  const end = new Date(subscription.current_period_end);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

function formatPlanLabel(planKey: string | null): string {
  if (!planKey) return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "pro") return "프로";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatKrw(value: number | null | undefined): string {
  return `${Math.max(0, value ?? 0).toLocaleString("ko-KR")} KRW`;
}

function formatPrompt(prompt: string | null | undefined): string {
  const value = prompt?.trim();
  if (!value) return "제목 없는 생성 결과";
  return value.length <= 72 ? value : `${value.slice(0, 72)}...`;
}

function formatGenerationStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "상태 확인 중";
  if (normalized === "completed") return "완료";
  if (normalized === "processing" || normalized === "running") return "생성 중";
  if (normalized === "queued" || normalized === "pending") return "대기 중";
  if (normalized === "failed" || normalized === "error") return "실패";
  return normalized;
}

function getStatusTone(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "completed") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (normalized === "failed" || normalized === "error") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (normalized === "processing" || normalized === "running") {
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] ring-1 ring-[var(--app-accent)]";
  }
  return "bg-[var(--app-surface-muted)] text-[var(--app-text)] ring-1 ring-stone-200";
}

export function getDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const emailName = email.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
}

function isProfileReady(profile: UserStyleProfileRow | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.height_cm &&
      profile.body_shape &&
      profile.top_size &&
      profile.bottom_size &&
      profile.fit_preference &&
      profile.exposure_preference &&
      profile.body_photo_path,
  );
}

function nextVisitDate(record: HairRecordRow): string {
  if (!record.service_date || !record.next_visit_target_days) return "-";
  const date = new Date(`${record.service_date}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "-";
  date.setDate(date.getDate() + record.next_visit_target_days);
  return formatDay(date.toISOString());
}

function buildTabHref(tab: MyPageTabId, queryState: QueryState) {
  const params = new URLSearchParams({ tab });
  if (queryState.payment) params.set("payment", queryState.payment);
  if (queryState.subscribed) params.set("subscribed", queryState.subscribed);
  if (queryState.checkoutId) params.set("checkout_id", queryState.checkoutId);
  return `/mypage?${params.toString()}`;
}

function MetricCard({
  helper,
  icon: Icon,
  label,
  value,
}: {
  helper: string;
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <SurfaceCard className="px-3 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">{label}</p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight text-[var(--app-text)] sm:mt-3 sm:text-3xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--app-muted)] sm:text-sm">{helper}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface)] text-[var(--app-text)] sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </span>
      </div>
    </SurfaceCard>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-black text-[var(--app-text)]">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

function TabNavigation({
  activeTab,
  queryState,
}: {
  activeTab: MyPageTabId;
  queryState: QueryState;
}) {
  return (
    <Panel as="nav" aria-label="마이페이지 탭" className="relative z-10 p-1.5 sm:p-2">
      <div
        role="tablist"
        aria-label="마이페이지 섹션"
        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] md:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              id={`mypage-tab-${tab.id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`mypage-panel-${tab.id}`}
              href={buildTabHref(tab.id, queryState)}
              className={`flex min-h-11 min-w-max shrink-0 items-center gap-2 rounded-[var(--app-radius-control)] border px-3 py-2 text-left transition sm:min-h-12 sm:px-4 ${
                active
                  ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block whitespace-nowrap text-sm font-black">{tab.label}</span>
                <span className={`hidden whitespace-nowrap text-xs sm:block ${active ? "text-white/70" : "text-[var(--app-muted)]"}`}>
                  {tab.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function UsagePanel({ generations }: { generations: GenerationRow[] }) {
  return (
    <Panel
      id="mypage-panel-usage"
      role="tabpanel"
      aria-labelledby="mypage-tab-usage"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader
        title="최근 사용기록"
        description="최근 헤어 생성 기록과 현재 처리 상태입니다."
      />
      <div className="mt-4 grid gap-3">
        {generations.length === 0 ? (
          <SurfaceCard className="border-dashed px-5 py-8 text-center">
            <p className="text-sm font-bold text-[var(--app-text)]">아직 생성 기록이 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              워크스페이스에서 첫 보드를 만들면 여기에 표시됩니다.
            </p>
          </SurfaceCard>
        ) : (
          generations.map((item) => (
            <Link
              key={item.id}
              href={`/result/${item.id}`}
              className="app-card group px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-[var(--app-radius-control)] px-3 py-1 text-xs font-bold ${getStatusTone(item.status)}`}>
                      {formatGenerationStatus(item.status)}
                    </span>
                    <span className="text-xs font-medium text-[var(--app-muted)]">{formatDate(item.created_at)}</span>
                    <span className="text-xs font-medium text-[var(--app-muted)]">
                      {Math.max(0, item.credits_used ?? 0).toLocaleString("ko-KR")} 크레딧
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--app-text)]">{formatPrompt(item.prompt_used)}</p>
                  <p className="mt-1 break-all text-xs text-[var(--app-muted)]">{item.id}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition group-hover:bg-stone-900 group-hover:text-white">
                  열기
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </Panel>
  );
}

function PlanPanel({
  activePlan,
  payments,
}: {
  activePlan: string;
  payments: PaymentTransactionRow[];
}) {
  return (
    <Panel
      id="mypage-panel-plan"
      role="tabpanel"
      aria-labelledby="mypage-tab-plan"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="플랜 및 결제" description="현재 플랜과 최근 결제 내역입니다." />
      <div className="mt-4 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SurfaceCard className="px-4 py-3">
          <p className="text-xs font-bold uppercase text-[var(--app-muted)]">활성 플랜</p>
          <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{activePlan}</p>
        </SurfaceCard>

        <div className="grid gap-3">
          {payments.length === 0 ? (
            <SurfaceCard className="border-dashed px-4 py-5 text-sm text-[var(--app-muted)]">
              결제 기록이 없습니다.
            </SurfaceCard>
          ) : (
            payments.map((item) => (
              <SurfaceCard key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--app-text)]">{formatKrw(item.amount)}</p>
                    <p className="mt-1 text-xs text-[var(--app-muted)]">
                      {item.status || "상태 없음"} / {(item.credits_to_grant ?? 0).toLocaleString("ko-KR")} 크레딧
                    </p>
                  </div>
                  <p className="text-right text-xs text-[var(--app-muted)]">{formatDate(item.paid_at ?? item.created_at)}</p>
                </div>
              </SurfaceCard>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function AftercarePanel({ hairRecords }: { hairRecords: HairRecordRow[] }) {
  return (
    <Panel
      id="mypage-panel-aftercare"
      role="tabpanel"
      aria-labelledby="mypage-tab-aftercare"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="에프터케어" description="최근 확정한 헤어 시술 기록입니다." />
      <div className="mt-4 grid gap-3">
        {hairRecords.length === 0 ? (
          <SurfaceCard className="border-dashed px-4 py-5 text-sm text-[var(--app-muted)]">
            아직 에프터케어 기록이 없습니다.
          </SurfaceCard>
        ) : (
          hairRecords.map((record) => (
            <Link
              key={record.id}
              href={`/aftercare/${record.id}`}
              className="app-card block px-4 py-3 transition hover:border-[var(--app-border-strong)]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface)] text-[var(--app-text)]">
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--app-text)]">{record.style_name || "제목 없는 스타일"}</p>
                  <p className="mt-1 text-xs text-[var(--app-muted)]">
                    {record.service_type || "시술"} / 다음 방문 {nextVisitDate(record)}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
        <Link
          href="/aftercare"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
        >
          에프터케어 보기
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Panel>
  );
}

function BodyProfilePanel() {
  return (
    <Panel
      id="mypage-panel-body-profile"
      role="tabpanel"
      aria-labelledby="mypage-tab-body-profile"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader
        title="바디프로필 설정"
        description="저장된 체형 정보와 참고 사진은 패션 추천에 사용됩니다."
      />
      <div className="mt-4">
        <StyleProfileForm variant="dashboard" />
      </div>
    </Panel>
  );
}

function AccountPanel({
  email,
  viewerName,
}: {
  email: string;
  viewerName: string;
}) {
  return (
    <Panel
      id="mypage-panel-account"
      role="tabpanel"
      aria-labelledby="mypage-tab-account"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader title="계정" description="로그인된 고객 계정의 기본 정보입니다." />
      <SurfaceCard className="mt-4 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[var(--app-text)]">{viewerName}</p>
            <p className="mt-1 truncate text-sm text-[var(--app-muted)]">{email}</p>
          </div>
        </div>
      </SurfaceCard>
    </Panel>
  );
}

function ActiveTabPanel({
  activePlan,
  activeTab,
  email,
  generations,
  hairRecords,
  payments,
  viewerName,
}: {
  activePlan: string;
  activeTab: MyPageTabId;
  email: string;
  generations: GenerationRow[];
  hairRecords: HairRecordRow[];
  payments: PaymentTransactionRow[];
  viewerName: string;
}) {
  if (activeTab === "plan") {
    return <PlanPanel activePlan={activePlan} payments={payments} />;
  }

  if (activeTab === "aftercare") {
    return <AftercarePanel hairRecords={hairRecords} />;
  }

  if (activeTab === "body-profile") {
    return <BodyProfilePanel />;
  }

  if (activeTab === "account") {
    return <AccountPanel email={email} viewerName={viewerName} />;
  }

  return <UsagePanel generations={generations} />;
}

export function MyPageDashboardTabs({
  activeTab,
  email,
  generations,
  hairRecords,
  payments,
  profile,
  queryState,
  styleProfile,
  subscription,
  viewerName,
}: MyPageDashboardTabsProps) {
  const latestPaidTx = payments.find((item) => item.status === "paid") ?? null;
  const subscriptionPlan = isActiveSubscription(subscription) ? subscription?.plan_key ?? null : null;
  const activePlan = formatPlanLabel(subscriptionPlan ?? getPlanFromMetadata(latestPaidTx?.metadata));
  const credits = Number.isInteger(profile?.credits) ? Number(profile?.credits) : 0;
  const creditsPerStyle = getCreditsPerStyle();
  const estimatedStyles = creditsPerStyle > 0 ? Math.floor(credits / creditsPerStyle) : 0;
  const usedCredits = generations.reduce((sum, item) => sum + Math.max(0, item.credits_used ?? 0), 0);
  const profileReady = isProfileReady(styleProfile);

  return (
    <AppPage className="flex flex-col gap-4 pb-16 sm:gap-5">
      <Panel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="app-kicker">My Page</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              계정 대시보드
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              {viewerName}님의 사용기록, 플랜, 사용량, 에프터케어, 바디프로필 설정을 탭으로 확인하세요.
            </p>
          </div>
          <Link
            href="/workspace"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
          >
            워크스페이스 열기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {queryState.payment === "success" || queryState.subscribed ? (
          <div className="mt-5 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {queryState.subscribed
              ? `${formatPlanLabel(queryState.subscribed)} 플랜이 활성화되었습니다.`
              : "결제가 확인되었습니다."}
            {queryState.checkoutId ? ` 체크아웃 ID: ${queryState.checkoutId}` : ""}
          </div>
        ) : null}
      </Panel>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <MetricCard
          icon={CreditCard}
          label="크레딧"
          value={credits.toLocaleString("ko-KR")}
          helper={`헤어 생성 약 ${estimatedStyles.toLocaleString("ko-KR")}회 가능`}
        />
        <MetricCard
          icon={Sparkles}
          label="플랜"
          value={activePlan}
          helper={subscription?.status ? `구독 상태 ${subscription.status}` : "활성 구독 정보 없음"}
        />
        <MetricCard
          icon={Activity}
          label="사용량"
          value={usedCredits.toLocaleString("ko-KR")}
          helper="최근 생성 기록에서 사용한 크레딧"
        />
        <MetricCard
          icon={Shirt}
          label="바디프로필"
          value={profileReady ? "준비됨" : "필요"}
          helper={profileReady ? "패션 추천에 저장된 프로필을 사용합니다" : "아래 프로필을 완성하세요"}
        />
      </section>

      <TabNavigation activeTab={activeTab} queryState={queryState} />

      <ActiveTabPanel
        activePlan={activePlan}
        activeTab={activeTab}
        email={email}
        generations={generations}
        hairRecords={hairRecords}
        payments={payments}
        viewerName={viewerName}
      />
    </AppPage>
  );
}
