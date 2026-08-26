"use client";

import { ArrowRight, Check, ScanFace } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type KeyboardEvent, useRef, useState } from "react";
import type { TranslationKey } from "../../lib/i18n/locales/ko";
import { useT } from "../../lib/i18n/useT";
import { LandingScene, SceneHeader } from "./LandingScene";

type PreviewGender = "male" | "female";

interface PreviewCard {
  titleKey: TranslationKey;
  bucketKey: TranslationKey;
  fitKey: TranslationKey;
  score: string;
  image: string;
}

const PREVIEW_GENDERS: PreviewGender[] = ["male", "female"];

const ORIGINAL_PROFILES: Record<
  PreviewGender,
  { image: string; faceShapeKey: TranslationKey; headBalanceKey: TranslationKey }
> = {
  male: {
    image: "/hero/demo/male-original.webp",
    faceShapeKey: "hero.demo.male.faceShapeValue",
    headBalanceKey: "hero.demo.male.headBalanceValue",
  },
  female: {
    image: "/hero/demo/female-original.webp",
    faceShapeKey: "hero.demo.female.faceShapeValue",
    headBalanceKey: "hero.demo.female.headBalanceValue",
  },
};

const PREVIEW_CARDS: Record<PreviewGender, PreviewCard[]> = {
  male: [
    ["hero.demo.male.card.1.title", "hero.demo.bucket.short", "hero.demo.fit.crown", "94", "/hero/demo/grid/male-v2-01.webp"],
    ["hero.demo.male.card.2.title", "hero.demo.bucket.short", "hero.demo.fit.temple", "92", "/hero/demo/grid/male-v2-02.webp"],
    ["hero.demo.male.card.3.title", "hero.demo.bucket.short", "hero.demo.fit.jawline", "90", "/hero/demo/grid/male-v2-03.webp"],
    ["hero.demo.male.card.4.title", "hero.demo.bucket.medium", "hero.demo.fit.temple", "91", "/hero/demo/grid/male-v2-04.webp"],
    ["hero.demo.male.card.5.title", "hero.demo.bucket.medium", "hero.demo.fit.crown", "88", "/hero/demo/grid/male-v2-05.webp"],
    ["hero.demo.male.card.6.title", "hero.demo.bucket.medium", "hero.demo.fit.crown", "86", "/hero/demo/grid/male-v2-06.webp"],
    ["hero.demo.male.card.7.title", "hero.demo.bucket.long", "hero.demo.fit.jawline", "84", "/hero/demo/grid/male-v2-07.webp"],
    ["hero.demo.male.card.8.title", "hero.demo.bucket.long", "hero.demo.fit.temple", "82", "/hero/demo/grid/male-v2-08.webp"],
    ["hero.demo.male.card.9.title", "hero.demo.bucket.medium", "hero.demo.fit.crown", "80", "/hero/demo/grid/male-v2-09.webp"],
  ].map(([titleKey, bucketKey, fitKey, score, image]) => ({ titleKey, bucketKey, fitKey, score, image })) as PreviewCard[],
  female: [
    ["hero.demo.female.card.1.title", "hero.demo.bucket.short", "hero.demo.fit.jawline", "95", "/hero/demo/grid/female-v2-01.webp"],
    ["hero.demo.female.card.2.title", "hero.demo.bucket.short", "hero.demo.fit.temple", "93", "/hero/demo/grid/female-v2-02.webp"],
    ["hero.demo.female.card.3.title", "hero.demo.bucket.short", "hero.demo.fit.crown", "89", "/hero/demo/grid/female-v2-03.webp"],
    ["hero.demo.female.card.4.title", "hero.demo.bucket.medium", "hero.demo.fit.jawline", "92", "/hero/demo/grid/female-v2-04.webp"],
    ["hero.demo.female.card.5.title", "hero.demo.bucket.medium", "hero.demo.fit.temple", "90", "/hero/demo/grid/female-v2-05.webp"],
    ["hero.demo.female.card.6.title", "hero.demo.bucket.medium", "hero.demo.fit.crown", "88", "/hero/demo/grid/female-v2-06.webp"],
    ["hero.demo.female.card.7.title", "hero.demo.bucket.long", "hero.demo.fit.jawline", "87", "/hero/demo/grid/female-v2-07.webp"],
    ["hero.demo.female.card.8.title", "hero.demo.bucket.long", "hero.demo.fit.crown", "85", "/hero/demo/grid/female-v2-08.webp"],
    ["hero.demo.female.card.9.title", "hero.demo.bucket.long", "hero.demo.fit.temple", "83", "/hero/demo/grid/female-v2-09.webp"],
  ].map(([titleKey, bucketKey, fitKey, score, image]) => ({ titleKey, bucketKey, fitKey, score, image })) as PreviewCard[],
};

export function HairstylePreviewShowcase() {
  const t = useT();
  const [activeGender, setActiveGender] = useState<PreviewGender>("male");
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Partial<Record<PreviewGender, HTMLButtonElement | null>>>({});
  const activeCards = PREVIEW_CARDS[activeGender];
  const activeCard = activeCards[activeIndex] ?? activeCards[0];
  const originalProfile = ORIGINAL_PROFILES[activeGender];

  const changeGender = (gender: PreviewGender) => {
    setActiveGender(gender);
    setActiveIndex(0);
  };

  const handleGenderKeyDown = (event: KeyboardEvent<HTMLButtonElement>, gender: PreviewGender) => {
    const currentIndex = PREVIEW_GENDERS.indexOf(gender);
    let nextGender: PreviewGender | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextGender = PREVIEW_GENDERS[(currentIndex + 1) % PREVIEW_GENDERS.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextGender = PREVIEW_GENDERS[(currentIndex - 1 + PREVIEW_GENDERS.length) % PREVIEW_GENDERS.length];
    } else if (event.key === "Home") {
      nextGender = PREVIEW_GENDERS[0];
    } else if (event.key === "End") {
      nextGender = PREVIEW_GENDERS[PREVIEW_GENDERS.length - 1];
    }

    if (!nextGender) return;
    event.preventDefault();
    changeGender(nextGender);
    tabRefs.current[nextGender]?.focus();
  };

  return (
    <LandingScene
      id="home-hairstyles"
      number="02"
      layout="editorial-split"
      motion="reveal"
      className="f-hairstyle-preview"
    >
      <SceneHeader
        eyebrow={t("hairstylePreview.eyebrow")}
        title={t("hairstylePreview.title")}
        description={t("hairstylePreview.description")}
      />

      <div className="f-hairstyle-preview__layout">
        <aside className="f-hairstyle-preview__origin" data-reveal-item data-reveal-order="4">
          <p className="f-hairstyle-preview__origin-label">{t("hairstylePreview.original")}</p>
          <div className="f-hairstyle-preview__origin-media" data-landing-media>
            <Image
              key={originalProfile.image}
              src={originalProfile.image}
              alt={`${t(`hero.gender.${activeGender}` as TranslationKey)} ${t("hairstylePreview.originalAlt")}`}
              fill
              sizes="(max-width: 840px) 112px, (max-width: 1120px) 22vw, 210px"
            />
          </div>
          <div className="f-hairstyle-preview__origin-copy">
            <p>{t("hairstylePreview.analysis")}</p>
            <dl>
              <div>
                <dt>{t("hero.demo.faceShapeLabel")}</dt>
                <dd>{t(originalProfile.faceShapeKey)}</dd>
              </div>
              <div>
                <dt>{t("hero.demo.headBalanceLabel")}</dt>
                <dd>{t(originalProfile.headBalanceKey)}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <div className="f-hairstyle-preview__board-column">
          <div className="f-hairstyle-preview__toolbar" data-reveal-item data-reveal-order="4">
            <div className="f-hairstyle-preview__tabs" role="tablist" aria-label={t("hero.demo.genderTabs")}>
              {PREVIEW_GENDERS.map((gender) => {
                const isActive = activeGender === gender;

                return (
                  <button
                    key={gender}
                    ref={(node) => {
                      tabRefs.current[gender] = node;
                    }}
                    id={`hairstyle-preview-tab-${gender}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="hairstyle-preview-panel"
                    tabIndex={isActive ? 0 : -1}
                    className="f-hairstyle-preview__tab"
                    onClick={() => changeGender(gender)}
                    onKeyDown={(event) => handleGenderKeyDown(event, gender)}
                  >
                    {t(`hero.gender.${gender}` as TranslationKey)}
                  </button>
                );
              })}
            </div>
            <p className="f-hairstyle-preview__ready">
              <span aria-hidden="true" />
              {t("hairstylePreview.ready")}
            </p>
          </div>

          <div
            id="hairstyle-preview-panel"
            role="tabpanel"
            aria-labelledby={`hairstyle-preview-tab-${activeGender}`}
            className="f-hairstyle-preview__grid"
          >
            {activeCards.map((card, index) => {
              const isActive = index === activeIndex;
              const title = t(card.titleKey);

              return (
                <button
                  key={`${activeGender}-${card.image}`}
                  type="button"
                  className="f-hairstyle-preview__option"
                  data-reveal-item
                  data-reveal-order={Math.min(index + 5, 13)}
                  aria-pressed={isActive}
                  aria-label={`${title}, ${t(card.bucketKey)}, ${t("hairstylePreview.score")} ${card.score}`}
                  onClick={() => setActiveIndex(index)}
                >
                  <span className="f-hairstyle-preview__media" data-landing-media>
                    <Image
                      src={card.image}
                      alt={`${title} ${t("hairstylePreview.optionAlt")}`}
                      fill
                      sizes="(max-width: 600px) 30vw, (max-width: 1120px) 27vw, 220px"
                    />
                    <span className="f-hairstyle-preview__score">{card.score}</span>
                    <span className="f-hairstyle-preview__check" aria-hidden="true">
                      <Check />
                    </span>
                    <span className="f-hairstyle-preview__caption">
                      <span>{String(index + 1).padStart(2, "0")} · {t(card.bucketKey)}</span>
                      <strong>{title}</strong>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside
          className="f-hairstyle-preview__summary"
          data-reveal-item
          data-reveal-order="6"
          aria-live="polite"
        >
          <p className="f-hairstyle-preview__selection-label">
            <ScanFace aria-hidden="true" />
            {t("hairstylePreview.selection")}
          </p>
          <p className="f-hairstyle-preview__summary-index">
            {String(activeIndex + 1).padStart(2, "0")} / 09
          </p>
          <h3 className="f-hairstyle-preview__summary-title">{t(activeCard.titleKey)}</h3>
          <dl className="f-hairstyle-preview__facts">
            <div>
              <dt>{t("hairstylePreview.length")}</dt>
              <dd>{t(activeCard.bucketKey)}</dd>
            </div>
            <div>
              <dt>{t("hairstylePreview.balance")}</dt>
              <dd>{t(activeCard.fitKey)}</dd>
            </div>
            <div>
              <dt>{t("hairstylePreview.score")}</dt>
              <dd>{activeCard.score}</dd>
            </div>
          </dl>
          <p className="f-hairstyle-preview__summary-copy">{t("hairstylePreview.summary")}</p>
          <Link href="/consulting/new" prefetch={false} className="f-landing-cta">
            {t("hairstylePreview.cta")}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </LandingScene>
  );
}
