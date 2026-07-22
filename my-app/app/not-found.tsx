import Link from "next/link";
import { buttonClassName } from "../components/ui/Button";
import { AppPage, Panel } from "../components/ui/Surface";

export default function NotFound() {
  return (
    <AppPage>
      <Panel className="mx-auto max-w-2xl space-y-5 p-6 text-center sm:p-8">
        <div className="space-y-2">
          <p className="app-kicker">404</p>
          <h1 className="text-2xl font-black tracking-tight text-[var(--app-text)]">
            요청한 페이지를 찾을 수 없습니다
          </h1>
          <p className="text-sm text-[var(--app-muted)]">
            주소가 바뀌었거나 더 이상 제공되지 않는 페이지일 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonClassName("secondary")}>
            홈으로 이동
          </Link>
          <Link href="/workspace" className={buttonClassName("primary")}>
            헤어스타일 생성 시작
          </Link>
        </div>
      </Panel>
    </AppPage>
  );
}
