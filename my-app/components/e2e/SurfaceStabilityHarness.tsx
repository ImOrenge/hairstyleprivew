import { AppPage, InverseCard, InverseSection, Panel, SurfaceCard } from "../ui/Surface";

export function SurfaceStabilityHarness() {
  return (
    <AppPage
      as="main"
      className="grid max-w-5xl gap-5 pb-16 pt-8"
      data-testid="surface-stability-matrix"
    >
      <Panel as="section" aria-labelledby="surface-title" className="grid gap-3 p-5 sm:p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="surface-title" className="break-keep text-2xl font-black leading-tight text-[var(--app-text)] sm:text-3xl">
          Surface 안정성 검증
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
          페이지, 패널, 카드와 반전 표면이 같은 토큰, 데이터 속성과 다형성 요소 계약을 유지합니다.
        </p>
      </Panel>

      <SurfaceCard
        as="a"
        className="grid min-h-32 content-between gap-4 p-5 transition hover:border-[var(--app-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
        data-testid="surface-link-card"
        href="#surface-inverse"
      >
        <span className="text-sm font-black text-[var(--app-text)]">링크로 렌더링한 SurfaceCard</span>
        <span className="text-sm text-[var(--app-muted)]">반전 표면으로 이동</span>
      </SurfaceCard>

      <InverseSection
        as="section"
        aria-labelledby="surface-inverse-title"
        className="grid gap-4 p-5 sm:p-6"
        id="surface-inverse"
      >
        <div>
          <p className="app-inverse-kicker">Inverse surface</p>
          <h2 id="surface-inverse-title" className="mt-2 text-2xl font-black">
            반전 표면
          </h2>
        </div>
        <InverseCard as="article" className="grid gap-2 p-4" data-testid="surface-inverse-card">
          <h3 className="font-black">InverseCard</h3>
          <p className="app-inverse-muted text-sm leading-6">
            좁은 화면과 다크 모드에서도 경계, 대비, 패턴과 내용 너비가 유지됩니다.
          </p>
        </InverseCard>
      </InverseSection>
    </AppPage>
  );
}
