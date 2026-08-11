"use client";

import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import { LandingScene, SceneHeader } from "./LandingScene";

const reviewImages = [
  {
    src: "/landing/editorial/review-compare-tablet-v2.webp",
    alt: "한 여성이 태블릿에서 자신의 짧은 보브, 미디엄 레이어, 긴 웨이브 후보를 비교하는 모습",
  },
  {
    src: "/landing/editorial/review-salon-tablet-v2.webp",
    alt: "헤어디자이너가 고객과 태블릿의 동일 고객 헤어 후보를 함께 보며 선택 방향을 이야기하는 모습",
  },
  {
    src: "/landing/editorial/review-fashion-tablet-v2.webp",
    alt: "한 인물이 태블릿의 선택 헤어와 전신 코디 연결 화면을 보며 실제 네이비 재킷을 고르는 모습",
  },
];

export function ReviewCarousel() {
  const t = useT();
  const reviews = [
    {
      author: t("reviews.r1.author"),
      role: t("reviews.r1.role"),
      body: t("reviews.r1.body"),
      result: t("reviews.r1.result"),
    },
    {
      author: t("reviews.r2.author"),
      role: t("reviews.r2.role"),
      body: t("reviews.r2.body"),
      result: t("reviews.r2.result"),
    },
    {
      author: t("reviews.r3.author"),
      role: t("reviews.r3.role"),
      body: t("reviews.r3.body"),
      result: t("reviews.r3.result"),
    },
  ];

  const metrics = [
    { label: t("reviews.metrics.1.label"), value: t("reviews.metrics.1.value") },
    { label: t("reviews.metrics.2.label"), value: t("reviews.metrics.2.value") },
    { label: t("reviews.metrics.3.label"), value: t("reviews.metrics.3.value") },
  ];

  return (
    <LandingScene id="home-reviews" number="07" layout="rolling-rail" tone="inverse">
      <div className="f-proof__header">
        <SceneHeader
          eyebrow={t("reviews.badge")}
          title={t("reviews.title")}
          description={t("reviews.subtitle")}
        />
        <div className="f-proof__metrics" aria-label="HairFit 이용 지표">
          {metrics.map((metric, index) => (
            <div data-reveal-item data-reveal-order={index + 4} key={metric.label}>
              <p className="f-proof__metric-value">{metric.value}</p>
              <p className="f-proof__metric-label">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="f-proof__rail"
        aria-label={`${t("reviews.title")} — 좌우로 스크롤할 수 있습니다`}
        tabIndex={0}
      >
        {reviews.map((review, index) => (
          <article
            className="f-review"
            data-reveal-item
            data-reveal-order={index + 5}
            key={review.author}
          >
            <div className="f-review__media" data-landing-media data-detail-closeup>
              <Image
                src={reviewImages[index].src}
                alt={reviewImages[index].alt}
                fill
                className="f-review__image"
                sizes="(max-width: 600px) 86vw, 28vw"
              />
            </div>
            <div>
              <p className="f-review__rating">5.0 Review</p>
              <blockquote className="f-review__quote">“{review.body}”</blockquote>
              <p className="f-review__result">{review.result}</p>
              <p className="f-review__author">{review.author}</p>
              <p className="f-review__role">{review.role}</p>
            </div>
          </article>
        ))}
      </div>
    </LandingScene>
  );
}
