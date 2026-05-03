import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { B2BLeadForm } from "../../../components/home/B2BLeadForm";
import { AppPage } from "../../../components/ui/Surface";

export const metadata: Metadata = {
  title: "B2B 도입 문의",
  description: "HairFit B2B 도입 상담을 신청하세요.",
};

export default function B2BContactPage() {
  return (
    <AppPage as="main" className="grid max-w-5xl gap-8 py-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <header className="space-y-4">
        <p className="app-kicker">B2B Contact</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          살롱 도입 상담을 신청하세요
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)] sm:text-base">
          운영 규모와 도입 목적을 남겨주시면 Salon CRM, 상담 이미지 활용, 팀 계정 구성에 맞춰 연락드리겠습니다.
        </p>
        <Link
          href="/b2b/signup"
          className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
        >
          B2B 회원가입
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <B2BLeadForm />
    </AppPage>
  );
}
