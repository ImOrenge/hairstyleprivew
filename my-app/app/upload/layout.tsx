import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "사진 업로드 | AI 헤어스타일 분석 시작",
  description:
    "정면 사진을 업로드하면 AI가 얼굴형을 분석하고 어울리는 헤어스타일 9가지를 추천합니다. 남자·여자 모두 가능, 결과는 미용실 상담 이미지로 저장.",
  keywords: [
    "헤어스타일 분석",
    "얼굴형 분석",
    "AI 헤어스타일",
    "사진 업로드 헤어",
    "미용실 상담",
  ],
  alternates: { canonical: "/upload" },
  openGraph: {
    title: "사진 업로드 | AI 헤어스타일 분석 시작 - HairFit",
    description: "정면 사진 한 장으로 얼굴형 맞춤 헤어스타일 9가지를 추천받으세요.",
    url: "/upload",
    type: "website",
  },
};

export default function UploadLayout({ children }: { children: ReactNode }) {
  return children;
}
