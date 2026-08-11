"use client";

import { CheckCircle2, Layers3, Palette, Shirt, Sparkles } from "lucide-react";
import Image from "next/image";
import { type KeyboardEvent, useState } from "react";
import { useT } from "../../lib/i18n/useT";
import type { TranslationKey } from "../../lib/i18n/locales/ko";
import { LandingScene, SceneHeader } from "./LandingScene";

type FashionDemoGender = "male" | "female";
type FashionDemoId =
  | "male-short-clean"
  | "male-medium-work"
  | "male-long-date"
  | "female-short-soft"
  | "female-medium-work"
  | "female-long-date";

interface FashionDemoLook {
  id: FashionDemoId;
  titleKey: TranslationKey;
  moodKey: TranslationKey;
  summaryKey: TranslationKey;
  hairLabelKey: TranslationKey;
  image: string;
  hairImage: string;
  palette: string[];
  items: TranslationKey[];
}

const DEMO_GENDERS: Array<{ id: FashionDemoGender; labelKey: TranslationKey }> = [
  { id: "male", labelKey: "fashionDemo.gender.male" },
  { id: "female", labelKey: "fashionDemo.gender.female" },
];

const DEMO_LOOKS: Record<FashionDemoGender, FashionDemoLook[]> = {
  male: [
    {
      id: "male-short-clean",
      titleKey: "fashionDemo.look.short.title",
      moodKey: "fashionDemo.look.short.mood",
      summaryKey: "fashionDemo.look.short.summary",
      hairLabelKey: "fashionDemo.look.short.hair",
      image: "/hero/fashion-demo/male-short-clean-v3.webp",
      hairImage: "/hero/demo/grid/male-v2-01.webp",
      palette: ["#3f3f3f", "#f1eadf", "#6f879c", "#f7f7f3"],
      items: [
        "fashionDemo.look.short.item.1",
        "fashionDemo.look.short.item.2",
        "fashionDemo.look.short.item.3",
      ],
    },
    {
      id: "male-medium-work",
      titleKey: "fashionDemo.look.medium.title",
      moodKey: "fashionDemo.look.medium.mood",
      summaryKey: "fashionDemo.look.medium.summary",
      hairLabelKey: "fashionDemo.look.medium.hair",
      image: "/hero/fashion-demo/male-medium-work-v3.webp",
      hairImage: "/hero/demo/grid/male-v2-05.webp",
      palette: ["#111827", "#b8cce0", "#9b9286", "#111111"],
      items: [
        "fashionDemo.look.medium.item.1",
        "fashionDemo.look.medium.item.2",
        "fashionDemo.look.medium.item.3",
      ],
    },
    {
      id: "male-long-date",
      titleKey: "fashionDemo.look.long.title",
      moodKey: "fashionDemo.look.long.mood",
      summaryKey: "fashionDemo.look.long.summary",
      hairLabelKey: "fashionDemo.look.long.hair",
      image: "/hero/fashion-demo/male-long-date-v3.webp",
      hairImage: "/hero/demo/grid/male-v2-07.webp",
      palette: ["#0f0f0f", "#f0e4d3", "#252525", "#f5f1ea"],
      items: [
        "fashionDemo.look.long.item.1",
        "fashionDemo.look.long.item.2",
        "fashionDemo.look.long.item.3",
      ],
    },
  ],
  female: [
    {
      id: "female-short-soft",
      titleKey: "fashionDemo.look.femaleShort.title",
      moodKey: "fashionDemo.look.femaleShort.mood",
      summaryKey: "fashionDemo.look.femaleShort.summary",
      hairLabelKey: "fashionDemo.look.femaleShort.hair",
      image: "/hero/fashion-demo/female-short-soft-v3.webp",
      hairImage: "/hero/demo/grid/female-v2-01.webp",
      palette: ["#f3eadc", "#faf7f0", "#b8cfe4", "#efe4d8"],
      items: [
        "fashionDemo.look.femaleShort.item.1",
        "fashionDemo.look.femaleShort.item.2",
        "fashionDemo.look.femaleShort.item.3",
      ],
    },
    {
      id: "female-medium-work",
      titleKey: "fashionDemo.look.femaleMedium.title",
      moodKey: "fashionDemo.look.femaleMedium.mood",
      summaryKey: "fashionDemo.look.femaleMedium.summary",
      hairLabelKey: "fashionDemo.look.femaleMedium.hair",
      image: "/hero/fashion-demo/female-medium-work-v3.webp",
      hairImage: "/hero/demo/grid/female-v2-05.webp",
      palette: ["#8f8376", "#fff8ef", "#b3aaa0", "#b9a58e"],
      items: [
        "fashionDemo.look.femaleMedium.item.1",
        "fashionDemo.look.femaleMedium.item.2",
        "fashionDemo.look.femaleMedium.item.3",
      ],
    },
    {
      id: "female-long-date",
      titleKey: "fashionDemo.look.femaleLong.title",
      moodKey: "fashionDemo.look.femaleLong.mood",
      summaryKey: "fashionDemo.look.femaleLong.summary",
      hairLabelKey: "fashionDemo.look.femaleLong.hair",
      image: "/hero/fashion-demo/female-long-date-v3.webp",
      hairImage: "/hero/demo/grid/female-v2-07.webp",
      palette: ["#151515", "#f1dfcf", "#f4ecdf", "#3a2e2a"],
      items: [
        "fashionDemo.look.femaleLong.item.1",
        "fashionDemo.look.femaleLong.item.2",
        "fashionDemo.look.femaleLong.item.3",
      ],
    },
  ],
};

export function FashionDemoShowcase() {
  const t = useT();
  const [activeGender, setActiveGender] = useState<FashionDemoGender>("male");
  const [activeId, setActiveId] = useState<FashionDemoId>("male-short-clean");
  const activeLooks = DEMO_LOOKS[activeGender];
  const activeLook = activeLooks.find((look) => look.id === activeId) ?? activeLooks[0];

  const handleGenderChange = (gender: FashionDemoGender) => {
    setActiveGender(gender);
    setActiveId(DEMO_LOOKS[gender][0].id);
  };

  const handleGenderKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % DEMO_GENDERS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + DEMO_GENDERS.length) % DEMO_GENDERS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = DEMO_GENDERS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    handleGenderChange(DEMO_GENDERS[nextIndex].id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
  };

  return (
    <LandingScene
      id="home-fashion"
      number="03"
      layout="sticky-stage"
      tone="inverse"
      motion="scroll-progress"
      className="f-fashion-stage"
    >
      <SceneHeader
        eyebrow={t("fashionDemo.badge")}
        title={t("fashionDemo.title")}
        description={t("fashionDemo.subtitle")}
      />

      <div className="f-fashion-stage__grid">
        <div className="f-fashion-stage__controls">
          <div
            className="f-fashion-stage__gender"
            data-reveal-item
            data-reveal-order="4"
            aria-label="패션 데모 성별 선택"
            role="tablist"
          >
            {DEMO_GENDERS.map((gender, index) => (
              <button
                key={gender.id}
                type="button"
                className="f-fashion-stage__gender-button"
                onClick={() => handleGenderChange(gender.id)}
                onKeyDown={(event) => handleGenderKeyDown(event, index)}
                id={`fashion-gender-${gender.id}`}
                role="tab"
                aria-controls="fashion-demo-panel"
                aria-selected={activeGender === gender.id}
                tabIndex={activeGender === gender.id ? 0 : -1}
              >
                {t(gender.labelKey)}
              </button>
            ))}
          </div>

          <div className="f-fashion-stage__looks">
            {activeLooks.map((look, index) => {
              const isActive = activeLook.id === look.id;
              return (
                <button
                  className="f-fashion-stage__look-button"
                  key={look.id}
                  type="button"
                  data-reveal-item
                  data-reveal-order={index + 5}
                  onClick={() => setActiveId(look.id)}
                  aria-pressed={isActive}
                >
                  <span className="f-fashion-stage__look-thumb" data-landing-media>
                    <Image
                      src={look.hairImage}
                      alt={`${t(look.hairLabelKey)} 헤어스타일 미리보기`}
                      fill
                      sizes="160px"
                    />
                  </span>
                  <span>
                    <span className="f-fashion-stage__look-index">
                      {String(index + 1).padStart(2, "0")} · {t(look.hairLabelKey)}
                    </span>
                    <span className="f-fashion-stage__look-title">{t(look.titleKey)}</span>
                    <span className="f-fashion-stage__look-mood">{t(look.moodKey)}</span>
                  </span>
                  <CheckCircle2 className="f-fashion-stage__look-check" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="f-fashion-stage__steps" aria-label="패션 추천 흐름">
            {[
              { icon: Layers3, key: "fashionDemo.step.hair" as TranslationKey },
              { icon: Palette, key: "fashionDemo.step.direction" as TranslationKey },
              { icon: Shirt, key: "fashionDemo.step.lookbook" as TranslationKey },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  className="f-fashion-stage__step"
                  data-reveal-item
                  data-reveal-order={index + 8}
                  key={step.key}
                >
                  <Icon aria-hidden="true" />
                  <span>{t(step.key)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="f-fashion-stage__media"
          id="fashion-demo-panel"
          role="tabpanel"
          aria-labelledby={`fashion-gender-${activeGender}`}
          data-landing-media
          data-reveal-item
          data-reveal-order="5"
        >
          <Image
            key={activeLook.image}
            src={activeLook.image}
            alt={t("fashionDemo.imageAlt")}
            fill
            className="f-fashion-stage__image"
            sizes="(max-width: 840px) 92vw, (max-width: 1120px) 58vw, 38vw"
          />
          <div className="f-fashion-stage__media-copy">
            <p className="f-fashion-stage__preview-label">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {t("fashionDemo.previewLabel")}
            </p>
            <h3 className="f-fashion-stage__media-title">{t(activeLook.titleKey)}</h3>
            <p className="f-fashion-stage__media-mood">{t(activeLook.moodKey)}</p>
          </div>
        </div>

        <aside
          className="f-fashion-stage__details"
          data-reveal-item
          data-reveal-order="6"
          aria-live="polite"
        >
          <div>
            <p className="f-fashion-stage__detail-label">{t("fashionDemo.recommendationLabel")}</p>
            <h3 className="f-fashion-stage__detail-title">{t(activeLook.titleKey)}</h3>
            <p className="f-fashion-stage__detail-summary">{t(activeLook.summaryKey)}</p>
          </div>

          <div>
            <p className="f-fashion-stage__detail-label">{t("fashionDemo.paletteLabel")}</p>
            <div className="f-fashion-stage__palette">
              {activeLook.palette.map((color) => (
                <span
                  className="f-fashion-stage__swatch"
                  key={color}
                  style={{ backgroundColor: color }}
                  role="img"
                  aria-label={`추천 색상 ${color}`}
                />
              ))}
            </div>
          </div>

          <ul className="f-fashion-stage__items">
            {activeLook.items.map((itemKey) => (
              <li className="f-fashion-stage__item" key={itemKey}>
                {t(itemKey)}
              </li>
            ))}
          </ul>

          <p className="f-fashion-stage__flow-note">
            <Shirt aria-hidden="true" />
            {t("fashionDemo.flowNote")}
          </p>
        </aside>
      </div>
    </LandingScene>
  );
}
