import Link from "next/link";
import { AppPage, Panel } from "../../../../components/ui/Surface";

export default function B2BSignupPage() {
  return (
    <AppPage className="max-w-2xl pb-16 pt-8">
      <Panel className="p-5 sm:p-6">
        <p className="app-kicker">B2B 계정 등록</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)]">
          B2B 신규 가입은 도입 문의로 접수합니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          살롱 운영자 신규 계정은 현재 직접 가입을 열지 않습니다. 기존 살롱 계정은 로그인 후 Salon CRM을 그대로 사용할 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/b2b/contact"
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
          >
            도입 문의하기
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
          >
            기존 계정 로그인
          </Link>
        </div>
      </Panel>
    </AppPage>
  );
}
