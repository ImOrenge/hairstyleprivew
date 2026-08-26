import { AppPage, Panel } from "../ui/Surface";

export function ConsultationRouteRecovery({ retryHref }: { retryHref: string }) {
  return (
    <AppPage className="py-10">
      <Panel className="mx-auto max-w-xl p-6" data-consulting-route-recovery="true">
        <p className="app-kicker">AI CONSULTANT</p>
        <h1 className="mt-2 text-2xl font-black text-[var(--app-text)]">상담을 다시 연결하고 있습니다</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          인증 또는 상담 정보를 잠시 불러오지 못했습니다. 아래 버튼으로 새 문서 요청을 보내면 기존 상담을 그대로 다시 엽니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="f-landing-cta" href={retryHref}>상담 다시 열기</a>
          <a className="f-landing-ghost-cta" href="/home">홈으로 이동</a>
        </div>
      </Panel>
    </AppPage>
  );
}
