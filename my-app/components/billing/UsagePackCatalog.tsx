import Link from "next/link";
import { formatServicePassCountsKo } from "../../lib/service-pass-counts.ts";
import { getUsagePacks } from "../../lib/usage-pack";
import { Panel, SurfaceCard } from "../ui/Surface";

export function UsagePackCatalog() {
  return (
    <Panel as="section" className="p-5 sm:p-6">
      <p className="app-kicker">단건 이용권</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]">
        필요한 만큼 단건으로 추가
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
        활성 유료 구독자는 정기 플랜과 별도로 단건 이용권을 추가할 수 있습니다. 상품을 선택하면 이용 자격을 확인한 뒤 결제 화면으로 이동합니다.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {getUsagePacks().map((item) => (
          <SurfaceCard key={item.key} className="flex h-full flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[var(--app-text)]">{item.label}</p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">
                  {formatServicePassCountsKo(item.servicePasses)}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                  서비스 제공기간: {item.servicePeriodLabelKo}
                </p>
              </div>
              <p className="text-sm font-black text-[var(--app-text)]">
                ₩{item.priceKrw.toLocaleString("ko-KR")}
              </p>
            </div>
            <Link
              href={`/billing/usage?pack=${item.key}`}
              className="mt-auto inline-flex items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-accent)] px-3 py-2 text-xs font-bold text-[var(--app-accent-contrast)] transition hover:opacity-90"
            >
              단건 이용권 구매
            </Link>
          </SurfaceCard>
        ))}
      </div>
    </Panel>
  );
}
