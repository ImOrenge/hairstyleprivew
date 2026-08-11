"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type LandingFaq = {
  id?: string;
  question: string;
  answer: string;
};

type FaqVisual = {
  src: string;
  alt: string;
  label: string;
};

const faqVisuals = {
  photo: {
    src: "/landing/editorial/faq-photo-self-capture-v2.webp",
    alt: "한 사람이 밝은 창가에서 스마트폰 삼각대를 사용해 얼굴과 어깨가 모두 보이는 정면 사진을 준비하는 모습",
    label: "정면 사진 준비",
  },
  preview: {
    src: "/landing/editorial/faq-preview-board-v2.webp",
    alt: "태블릿에서 같은 인물의 짧은 머리부터 긴 머리까지 아홉 가지 헤어 후보를 비교하는 모습",
    label: "3×3 헤어 비교",
  },
  salon: {
    src: "/landing/editorial/faq-salon-use-v2.webp",
    alt: "미용실 의자에 앉은 고객이 헤어디자이너와 태블릿의 동일 고객 헤어 후보를 확인하는 모습",
    label: "미용실 상담 활용",
  },
  fashion: {
    src: "/landing/editorial/faq-fashion-flow-v2.webp",
    alt: "태블릿에서 선택한 헤어 사진이 같은 인물의 전신 패션 코디로 이어지는 모습을 확인하는 장면",
    label: "헤어에서 패션으로",
  },
} satisfies Record<string, FaqVisual>;

function getFaqVisual(question: string): FaqVisual {
  if (/미용실|상담/.test(question)) return faqVisuals.salon;
  if (/패션|코디/.test(question)) return faqVisuals.fashion;
  if (/사진/.test(question)) return faqVisuals.photo;
  return faqVisuals.preview;
}

export function FaqShowcase({ faqs }: { faqs: LandingFaq[] }) {
  const firstVisual = useMemo(
    () => getFaqVisual(faqs[0]?.question ?? "사진"),
    [faqs],
  );
  const [activeVisual, setActiveVisual] = useState(firstVisual);

  return (
    <div className="f-faq">
      <figure
        className="f-faq__media"
        data-landing-media
        data-detail-closeup
        data-reveal-item
        data-reveal-order="4"
        aria-live="polite"
      >
        <Image
          key={activeVisual.src}
          src={activeVisual.src}
          alt={activeVisual.alt}
          width={1536}
          height={1024}
          className="f-faq__image"
          sizes="(max-width: 840px) 92vw, 42vw"
        />
        <figcaption className="f-faq__media-caption">{activeVisual.label}</figcaption>
      </figure>
      <div className="f-faq__list">
        {faqs.map((faq, index) => (
          <details
            className="f-faq-item"
            data-landing-surface
            data-reveal-item
            data-reveal-order={Math.min(index + 5, 13)}
            key={faq.id ?? faq.question}
            onToggle={(event) => {
              if (event.currentTarget.open) setActiveVisual(getFaqVisual(faq.question));
            }}
          >
            <summary className="f-faq-item__summary">
              <span className="f-faq-item__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="f-faq-item__question">{faq.question}</span>
              <span className="f-faq-item__indicator" aria-hidden="true">+</span>
            </summary>
            <p className="f-faq-item__answer">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
