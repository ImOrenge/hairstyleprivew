"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Layers3, Palette, Shirt, Sparkles } from "lucide-react";
import { InverseCard, InverseSection } from "../ui/Surface";
import { useT } from "../../lib/i18n/useT";
import type { TranslationKey } from "../../lib/i18n/locales/ko";

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
    image: "/hero/fashion-demo/short-clean.webp",
    hairImage: "/hero/demo/grid/male-01.webp",
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
    image: "/hero/fashion-demo/medium-work.webp",
    hairImage: "/hero/demo/grid/male-05.webp",
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
    image: "/hero/fashion-demo/long-date.webp",
    hairImage: "/hero/demo/grid/male-07.webp",
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
      image: "/hero/fashion-demo/female-short-soft.webp",
      hairImage: "/hero/demo/grid/female-01.webp",
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
      image: "/hero/fashion-demo/female-medium-work.webp",
      hairImage: "/hero/demo/grid/female-05.webp",
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
      image: "/hero/fashion-demo/female-long-date.webp",
      hairImage: "/hero/demo/grid/female-07.webp",
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

  return (
    <InverseSection as="section" className="overflow-hidden transition-colors">
      <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col justify-between gap-6 p-5 sm:p-6 lg:p-8">
          <div>
            <p className="app-inverse-kicker">{t("fashionDemo.badge")}</p>
            <h2 className="mt-4 max-w-xl text-2xl font-black tracking-tight text-[var(--app-inverse-text)] sm:text-4xl">
              {t("fashionDemo.title")}
            </h2>
            <p className="app-inverse-muted mt-4 max-w-xl text-sm leading-6 sm:text-base">
              {t("fashionDemo.subtitle")}
            </p>
          </div>

          <InverseCard className="grid grid-cols-2 gap-1 p-1">
            {DEMO_GENDERS.map((gender) => {
              const isActive = activeGender === gender.id;

              return (
                <button
                  key={gender.id}
                  type="button"
                  onClick={() => handleGenderChange(gender.id)}
                  className={[
                    "min-h-11 rounded-[var(--app-radius-control)] px-4 text-sm font-black uppercase tracking-[0.04em] transition",
                    isActive
                      ? "bg-[var(--app-inverse-text)] text-[var(--app-inverse)] shadow-lg"
                      : "app-inverse-muted hover:bg-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)] hover:text-[var(--app-inverse-text)]",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  {t(gender.labelKey)}
                </button>
              );
            })}
          </InverseCard>

          <div className="grid gap-3">
            {activeLooks.map((look, index) => {
              const isActive = activeLook.id === look.id;

              return (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => setActiveId(look.id)}
                  className={[
                    "group grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 border p-3 text-left transition",
                    isActive
                      ? "border-[var(--app-accent)] bg-[var(--app-inverse-text)] text-[var(--app-inverse)] shadow-xl"
                      : "app-inverse-card text-[var(--app-inverse-text)] hover:border-[color-mix(in_srgb,var(--app-inverse-text)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)]",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  <span className="relative h-16 overflow-hidden rounded-[var(--app-radius-control)] bg-[var(--app-inverse-muted)]">
                    <Image
                      src={look.hairImage}
                      alt={`${t(look.hairLabelKey)} 헤어스타일 미리보기`}
                      fill
                      className="object-cover"
                      sizes="68px"
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={[
                        "block text-xs font-black uppercase tracking-[0.16em]",
                        isActive ? "text-[var(--app-accent-strong)]" : "text-[var(--app-accent)]",
                      ].join(" ")}
                    >
                      {String(index + 1).padStart(2, "0")} · {t(look.hairLabelKey)}
                    </span>
                    <span className="mt-1 block text-base font-black leading-5">{t(look.titleKey)}</span>
                    <span className={isActive ? "mt-1 block text-xs font-semibold text-[var(--app-inverse-muted)]" : "app-inverse-subtle mt-1 block text-xs font-semibold"}>
                      {t(look.moodKey)}
                    </span>
                  </span>
                  <CheckCircle2
                    className={isActive ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-[color-mix(in_srgb,var(--app-inverse-text)_25%,transparent)] transition group-hover:text-[color-mix(in_srgb,var(--app-inverse-text)_60%,transparent)]"}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Layers3, key: "fashionDemo.step.hair" as TranslationKey },
              { icon: Palette, key: "fashionDemo.step.direction" as TranslationKey },
              { icon: Shirt, key: "fashionDemo.step.lookbook" as TranslationKey },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <InverseCard key={step.key} className="p-4">
                  <Icon className="h-5 w-5 text-[var(--app-accent)]" aria-hidden="true" />
                  <p className="app-inverse-muted mt-3 text-xs font-bold leading-5">{t(step.key)}</p>
                </InverseCard>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)] p-4 text-[var(--app-inverse-text)] lg:border-l lg:border-t-0 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <InverseCard className="relative min-h-[32rem] overflow-hidden sm:min-h-[40rem] lg:min-h-[43rem]">
              <Image
                key={activeLook.image}
                src={activeLook.image}
                alt={t("fashionDemo.imageAlt")}
                fill
                priority
                className="object-cover object-top"
                sizes="(max-width: 1024px) 100vw, 420px"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/28 to-transparent p-5 text-[var(--app-inverse-text)]">
                <p className="inline-flex items-center gap-2 border border-[color-mix(in_srgb,var(--app-inverse-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--app-inverse-text)_15%,transparent)] px-3 py-1 text-xs font-bold">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("fashionDemo.previewLabel")}
                </p>
                <h3 className="mt-3 text-xl font-black">{t(activeLook.titleKey)}</h3>
                <p className="mt-1 text-sm font-semibold text-[color-mix(in_srgb,var(--app-inverse-text)_78%,transparent)]">{t(activeLook.moodKey)}</p>
              </div>
            </InverseCard>

            <aside className="flex flex-col gap-4">
              <InverseCard className="p-5">
                <p className="app-inverse-kicker">
                  {t("fashionDemo.recommendationLabel")}
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-inverse-text)]">
                  {t(activeLook.titleKey)}
                </h3>
                <p className="app-inverse-muted mt-3 text-sm leading-6">{t(activeLook.summaryKey)}</p>
              </InverseCard>

              <InverseCard className="p-5">
                <p className="app-inverse-subtle text-xs font-black uppercase tracking-[0.18em]">
                  {t("fashionDemo.paletteLabel")}
                </p>
                <div className="mt-4 flex gap-2">
                  {activeLook.palette.map((color) => (
                    <span
                      key={color}
                      className="h-10 flex-1 border border-[color-mix(in_srgb,var(--app-inverse-text)_18%,transparent)]"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </InverseCard>

              <div className="grid flex-1 gap-3">
                {activeLook.items.map((itemKey) => (
                  <InverseCard
                    key={itemKey}
                    className="px-4 py-3"
                  >
                    <p className="text-sm font-bold leading-6 text-[var(--app-inverse-text)]">{t(itemKey)}</p>
                  </InverseCard>
                ))}
              </div>

              <InverseCard className="border-[var(--app-accent)] p-5">
                <Shirt className="h-5 w-5 text-[var(--app-accent)]" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold leading-6">{t("fashionDemo.flowNote")}</p>
              </InverseCard>
            </aside>
          </div>
        </div>
      </div>
    </InverseSection>
  );
}
