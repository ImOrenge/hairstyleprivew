import Link from "next/link";
import { Button } from "../ui/Button";

export function HeroSection() {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-orange-200 via-amber-50 to-teal-100 p-8 sm:p-12">
      <p className="text-sm font-medium text-gray-700">AI Hairstyle Preview SaaS</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
        AI로 찾는 인생 헤어스타일
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-gray-700 sm:text-base">
        사진 업로드부터 결과 비교까지 한 번에. 미용실 방문 전에 자연스럽게 스타일을 확인하세요.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/upload">
          <Button>지금 무료로 시작하기</Button>
        </Link>
        <Link href="/generate">
          <Button variant="secondary">데모 생성 보기</Button>
        </Link>
      </div>
    </section>
  );
}
