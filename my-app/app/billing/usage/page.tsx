import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PortoneUsagePackCheckoutForm } from "../../../components/payments/PortoneUsagePackCheckoutForm";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";
import { getUsagePackEligibility } from "../../../lib/usage-pack-eligibility";
import { getUsagePack, getUsagePacks, isUsagePackKey } from "../../../lib/usage-pack";

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatKrw(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

export default async function UsagePackCheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const requestedPack = readSearchParam(params, "pack");
  const packKey = isUsagePackKey(requestedPack) ? requestedPack : "usage80";
  const pack = getUsagePack(packKey);
  const { userId } = await auth();

  if (!userId) {
    redirect(buildSignInRedirectUrl(`/billing/usage?pack=${encodeURIComponent(packKey)}`));
  }

  let eligible = false;
  if (isSupabaseConfigured()) {
    try {
      const result = await getUsagePackEligibility(
        getSupabaseAdminClient() as unknown as Parameters<typeof getUsagePackEligibility>[0],
        userId,
      );
      eligible = result.eligible;
    } catch (error) {
      console.error("[billing/usage] 구독 자격 확인 실패:", error);
    }
  }

  const clerkUser = await currentUser();
  const initialBuyerName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    "";
  const initialBuyerEmail =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
    "";
  const initialBuyerPhone =
    clerkUser?.primaryPhoneNumber?.phoneNumber?.trim() ||
    clerkUser?.phoneNumbers?.[0]?.phoneNumber?.trim() ||
    "";

  return (
    <AppPage className="grid gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">Usage add-on</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          추가 이용권 구매
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          정기구독은 그대로 유지하고 필요한 이용량만 한 번 추가합니다. 추가 이용권은 활성 유료
          구독자 전용 상품입니다.
        </p>
      </Panel>

      <section className="grid gap-3 sm:grid-cols-3">
        {getUsagePacks().map((item) => (
          <Link
            key={item.key}
            href={`/billing/usage?pack=${item.key}`}
            className={`app-card block p-4 transition hover:border-[var(--app-border-strong)] ${
              item.key === pack.key ? "border-[var(--app-border-strong)] bg-[var(--app-surface-muted)]" : ""
            }`}
          >
            <p className="text-sm font-black text-[var(--app-text)]">{item.label}</p>
            <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{formatKrw(item.priceKrw)}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">
              서비스 내부 기능에서만 사용되며 양도, 출금, 현금 교환은 지원하지 않습니다.
            </p>
          </Link>
        ))}
      </section>

      {!eligible ? (
        <Panel as="section" className="grid gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-black text-[var(--app-text)]">먼저 정기구독을 시작해 주세요</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              추가 이용권은 Basic, Standard, Pro 등 활성 유료 구독을 보완하는 상품입니다.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
            href="/billing"
          >
            정기구독 플랜 보기
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel as="section" className="p-5 sm:p-6">
            <PortoneUsagePackCheckoutForm
              packKey={pack.key}
              initialBuyerName={initialBuyerName}
              initialBuyerEmail={initialBuyerEmail}
              initialBuyerPhone={initialBuyerPhone}
            />
          </Panel>

          <SurfaceCard as="aside" className="h-fit p-5">
            <p className="app-kicker">선택 상품</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">{pack.label}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
              결제 확인 즉시 계정에 서비스 이용량 {pack.credits.toLocaleString("ko-KR")}이 추가됩니다.
            </p>
            <div className="mt-5 border-t border-[var(--app-border)] pt-4">
              <p className="text-xs font-bold uppercase text-[var(--app-muted)]">단건 결제 금액</p>
              <p className="mt-1 text-3xl font-black text-[var(--app-text)]">{formatKrw(pack.priceKrw)}</p>
            </div>
            <ul className="mt-5 grid gap-1.5 border-t border-[var(--app-border)] pt-4 text-xs leading-5 text-[var(--app-muted)]">
              <li>정기구독 금액과 결제일은 변경되지 않습니다.</li>
              <li>다른 사용자에게 양도하거나 판매할 수 없습니다.</li>
              <li>미사용분 환불은 서비스 환불 정책과 결제 내역을 기준으로 처리됩니다.</li>
            </ul>
          </SurfaceCard>
        </div>
      )}
    </AppPage>
  );
}
