"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Layers3, Palette, Shirt, Sparkles } from "lucide-react";
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
    <section className="overflow-hidden rounded-3xl border border-stone-200/70 bg-stone-950 text-white shadow-2xl transition-colors dark:border-zinc-800/70">
      <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col justify-between gap-8 p-6 sm:p-8 lg:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{t("fashionDemo.badge")}</p>
            <h2 className="mt-4 max-w-xl text-2xl font-black tracking-tight text-white sm:text-4xl">
              {t("fashionDemo.title")}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-stone-300 sm:text-base">
              {t("fashionDemo.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-1">
            {DEMO_GENDERS.map((gender) => {
              const isActive = activeGender === gender.id;

              return (
                <button
                  key={gender.id}
                  type="button"
                  onClick={() => handleGenderChange(gender.id)}
                  className={[
                    "min-h-11 rounded-xl px-4 text-sm font-black transition",
                    isActive ? "bg-white text-stone-950 shadow-lg" : "text-stone-300 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  {t(gender.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3">
            {activeLooks.map((look, index) => {
              const isActive = activeLook.id === look.id;

              return (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => setActiveId(look.id)}
                  className={[
                    "group grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left transition",
                    isActive
                      ? "border-amber-300/70 bg-white text-stone-950 shadow-xl"
                      : "border-white/10 bg-white/[0.06] text-white hover:border-white/25 hover:bg-white/[0.1]",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  <span className="relative h-16 overflow-hidden rounded-xl bg-stone-800">
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
                        isActive ? "text-amber-700" : "text-amber-300",
                      ].join(" ")}
                    >
                      {String(index + 1).padStart(2, "0")} · {t(look.hairLabelKey)}
                    </span>
                    <span className="mt-1 block text-base font-black leading-5">{t(look.titleKey)}</span>
                    <span className={isActive ? "mt-1 block text-xs font-semibold text-stone-600" : "mt-1 block text-xs font-semibold text-stone-400"}>
                      {t(look.moodKey)}
                    </span>
                  </span>
                  <CheckCircle2
                    className={isActive ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-white/25 transition group-hover:text-white/60"}
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
                <div key={step.key} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <Icon className="h-5 w-5 text-amber-300" aria-hidden="true" />
                  <p className="mt-3 text-xs font-bold leading-5 text-stone-300">{t(step.key)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/10 bg-stone-100 p-4 text-stone-950 dark:bg-zinc-950 lg:border-l lg:border-t-0 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="relative min-h-[32rem] overflow-hidden rounded-3xl bg-stone-200 shadow-2xl sm:min-h-[40rem] lg:min-h-[43rem]">
              <Image
                key={activeLook.image}
                src={activeLook.image}
                alt={t("fashionDemo.imageAlt")}
                fill
                priority
                className="object-cover object-top"
                sizes="(max-width: 1024px) 100vw, 420px"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/28 to-transparent p-5 text-white">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("fashionDemo.previewLabel")}
                </p>
                <h3 className="mt-3 text-xl font-black">{t(activeLook.titleKey)}</h3>
                <p className="mt-1 text-sm font-semibold text-white/78">{t(activeLook.moodKey)}</p>
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                  {t("fashionDemo.recommendationLabel")}
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-stone-950 dark:text-white">
                  {t(activeLook.titleKey)}
                </h3>
                <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300">{t(activeLook.summaryKey)}</p>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-400">
                  {t("fashionDemo.paletteLabel")}
                </p>
                <div className="mt-4 flex gap-2">
                  {activeLook.palette.map((color) => (
                    <span
                      key={color}
                      className="h-10 flex-1 rounded-full border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid flex-1 gap-3">
                {activeLook.items.map((itemKey) => (
                  <div
                    key={itemKey}
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-sm font-bold leading-6 text-stone-800 dark:text-zinc-100">{t(itemKey)}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/60 p-5 text-amber-950 dark:border-amber-400/20 dark:from-amber-400/10 dark:to-amber-500/5 dark:text-amber-100">
                <Shirt className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold leading-6">{t("fashionDemo.flowNote")}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
