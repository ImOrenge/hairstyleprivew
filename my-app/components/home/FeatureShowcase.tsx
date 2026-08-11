"use client";

import { Camera, CheckCircle2, Grid3X3, Shirt } from "lucide-react";
import Image from "next/image";
import { useT } from "../../lib/i18n/useT";
import { LandingScene, SceneHeader } from "./LandingScene";

const featureImages = [
  {
    src: "/landing/editorial/feature-face-line.webp",
    alt: "거울을 보며 앞머리와 관자 옆볼륨이 얼굴선을 감싸는 정도를 확인하는 모습",
  },
  {
    src: "/landing/editorial/feature-neckline.webp",
    alt: "같은 헤어 길이에 오픈 칼라와 하이넥을 대어 목선과 상체 실루엣을 비교하는 모습",
  },
  {
    src: "/landing/editorial/feature-mood.webp",
    alt: "선택한 헤어 사진과 차콜, 아이보리, 코발트 원단으로 착장 무드를 연결하는 모습",
  },
  {
    src: "/landing/editorial/feature-occasion-tablet-v2.webp",
    alt: "한 인물이 태블릿에서 동일한 헤어의 데일리, 워크, 데이트 전신 코디를 상황별로 비교하는 모습",
  },
];

export function FeatureShowcase() {
  const t = useT();
  const features = [
    {
      title: t("features.1.title"),
      description: t("features.1.desc"),
      point: t("features.1.point"),
      icon: Camera,
    },
    {
      title: t("features.2.title"),
      description: t("features.2.desc"),
      point: t("features.2.point"),
      icon: Grid3X3,
    },
    {
      title: t("features.3.title"),
      description: t("features.3.desc"),
      point: t("features.3.point"),
      icon: CheckCircle2,
    },
    {
      title: t("features.4.title"),
      description: t("features.4.desc"),
      point: t("features.4.point"),
      icon: Shirt,
    },
  ];

  return (
    <LandingScene id="home-features" number="05" layout="editorial-split">
      <SceneHeader
        eyebrow={t("features.badge")}
        title={t("features.title")}
        description="기능을 작은 카드로 나누지 않고, 실제 헤어와 패션이 이어지는 장면으로 보여드립니다."
      />
      <div className="f-feature-stories">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const media = featureImages[index];

          return (
            <article
              className="f-feature-story"
              data-reveal-item
              data-reveal-order={index + 4}
              key={feature.title}
            >
              <div className="f-feature-story__media" data-landing-media data-detail-closeup>
                <Image
                  src={media.src}
                  alt={media.alt}
                  fill
                  className="f-feature-story__image"
                  sizes="(max-width: 840px) 92vw, 58vw"
                />
              </div>
              <div>
                <p className="f-feature-story__index">{String(index + 1).padStart(2, "0")}</p>
                <Icon className="f-feature-story__icon" aria-hidden="true" />
                <h3 className="f-feature-story__title">{feature.title}</h3>
                <p className="f-feature-story__description">{feature.description}</p>
                <p className="f-feature-story__point">{feature.point}</p>
              </div>
            </article>
          );
        })}
      </div>
    </LandingScene>
  );
}
