import Link from "next/link";

export default function DiscoveryNotFound() {
  return (
    <section className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-content-center gap-4 px-4 py-16 text-center">
      <p className="text-xs font-black tracking-[0.16em] text-[var(--app-accent-strong)]">HAIRFIT DISCOVERY · 404</p>
      <h1 className="text-4xl font-black tracking-[-0.05em] sm:text-6xl">공개된 가이드를 찾을 수 없습니다</h1>
      <p className="text-[var(--app-muted)]">주소가 바뀌었거나 아직 검토 중인 검색 가이드입니다.</p>
      <Link className="mx-auto underline underline-offset-4" href="/discover">공개 가이드로 돌아가기</Link>
    </section>
  );
}
