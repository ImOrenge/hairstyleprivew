"use client";

import { CSSProperties, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, Grid3X3, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";
import type { TranslationKey } from "../../lib/i18n/locales/ko";
import styles from "./HeroSection.module.css";

interface HeroSectionProps {
  userCount?: number;
  avatars?: string[];
}

type DemoGender = "male" | "female";

type RecommendationDemoCard = {
  titleKey: TranslationKey;
  bucketKey: TranslationKey;
  fitKey: TranslationKey;
  score: string;
  image: string;
  featured?: boolean;
};

type DemoProfile = {
  labelKey: TranslationKey;
  originalImage: string;
  faceShapeKey: TranslationKey;
  headBalanceKey: TranslationKey;
  cards: RecommendationDemoCard[];
};

const DEMO_GENDERS: DemoGender[] = ["male", "female"];

const DEMO_PROFILES: Record<DemoGender, DemoProfile> = {
  male: {
    labelKey: "hero.gender.male",
    originalImage: "/hero/demo/male-original.webp",
    faceShapeKey: "hero.demo.male.faceShapeValue",
    headBalanceKey: "hero.demo.male.headBalanceValue",
    cards: [
      {
        titleKey: "hero.demo.male.card.1.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.crown",
        score: "94",
        image: "/hero/demo/grid/male-01.webp",
        featured: true,
      },
      {
        titleKey: "hero.demo.male.card.2.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.temple",
        score: "92",
        image: "/hero/demo/grid/male-02.webp",
      },
      {
        titleKey: "hero.demo.male.card.3.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.jawline",
        score: "90",
        image: "/hero/demo/grid/male-03.webp",
      },
      {
        titleKey: "hero.demo.male.card.4.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.temple",
        score: "91",
        image: "/hero/demo/grid/male-04.webp",
      },
      {
        titleKey: "hero.demo.male.card.5.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.crown",
        score: "88",
        image: "/hero/demo/grid/male-05.webp",
      },
      {
        titleKey: "hero.demo.male.card.6.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.crown",
        score: "86",
        image: "/hero/demo/grid/male-06.webp",
      },
      {
        titleKey: "hero.demo.male.card.7.title",
        bucketKey: "hero.demo.bucket.long",
        fitKey: "hero.demo.fit.jawline",
        score: "84",
        image: "/hero/demo/grid/male-07.webp",
      },
      {
        titleKey: "hero.demo.male.card.8.title",
        bucketKey: "hero.demo.bucket.long",
        fitKey: "hero.demo.fit.temple",
        score: "82",
        image: "/hero/demo/grid/male-08.webp",
      },
      {
        titleKey: "hero.demo.male.card.9.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.crown",
        score: "80",
        image: "/hero/demo/grid/male-09.webp",
      },
    ],
  },
  female: {
    labelKey: "hero.gender.female",
    originalImage: "/hero/demo/female-original.webp",
    faceShapeKey: "hero.demo.female.faceShapeValue",
    headBalanceKey: "hero.demo.female.headBalanceValue",
    cards: [
      {
        titleKey: "hero.demo.female.card.1.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.jawline",
        score: "95",
        image: "/hero/demo/grid/female-01.webp",
        featured: true,
      },
      {
        titleKey: "hero.demo.female.card.2.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.temple",
        score: "93",
        image: "/hero/demo/grid/female-02.webp",
      },
      {
        titleKey: "hero.demo.female.card.3.title",
        bucketKey: "hero.demo.bucket.short",
        fitKey: "hero.demo.fit.crown",
        score: "89",
        image: "/hero/demo/grid/female-03.webp",
      },
      {
        titleKey: "hero.demo.female.card.4.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.jawline",
        score: "92",
        image: "/hero/demo/grid/female-04.webp",
      },
      {
        titleKey: "hero.demo.female.card.5.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.temple",
        score: "90",
        image: "/hero/demo/grid/female-05.webp",
      },
      {
        titleKey: "hero.demo.female.card.6.title",
        bucketKey: "hero.demo.bucket.medium",
        fitKey: "hero.demo.fit.crown",
        score: "88",
        image: "/hero/demo/grid/female-06.webp",
      },
      {
        titleKey: "hero.demo.female.card.7.title",
        bucketKey: "hero.demo.bucket.long",
        fitKey: "hero.demo.fit.jawline",
        score: "87",
        image: "/hero/demo/grid/female-07.webp",
      },
      {
        titleKey: "hero.demo.female.card.8.title",
        bucketKey: "hero.demo.bucket.long",
        fitKey: "hero.demo.fit.crown",
        score: "85",
        image: "/hero/demo/grid/female-08.webp",
      },
      {
        titleKey: "hero.demo.female.card.9.title",
        bucketKey: "hero.demo.bucket.long",
        fitKey: "hero.demo.fit.temple",
        score: "83",
        image: "/hero/demo/grid/female-09.webp",
      },
    ],
  },
};

export function HeroSection({ userCount = 0, avatars = [] }: HeroSectionProps) {
  const t = useT();
  const [activeDemoGender, setActiveDemoGender] = useState<DemoGender>("male");
  const titleLines = t("hero.title").split("\n");
  const activeDemo = DEMO_PROFILES[activeDemoGender];

  const workflowSteps = [
    { icon: Camera, label: t("hero.workflow.upload"), detail: t("hero.workflow.uploadDetail") },
    { icon: Sparkles, label: t("hero.workflow.analysis"), detail: t("hero.workflow.analysisDetail") },
    { icon: Grid3X3, label: t("hero.workflow.grid"), detail: t("hero.workflow.gridDetail") },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-stone-200/15 bg-stone-950 p-5 text-white shadow-2xl sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">{t("hero.badge")}</p>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            {titleLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-200 sm:text-base">
            {t("hero.subtitle")}
          </p>
          <p className="mt-3 max-w-xl text-xs font-semibold leading-5 text-stone-400 sm:text-sm">
            {t("hero.supporting")}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-2xl font-black">1</p>
              <p className="mt-1 text-xs font-semibold text-stone-300">{t("hero.stat.photo")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-2xl font-black">3x3</p>
              <p className="mt-1 text-xs font-semibold text-stone-300">{t("hero.stat.grid")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-2xl font-black">AI</p>
              <p className="mt-1 text-xs font-semibold text-stone-300">{t("hero.stat.analysis")}</p>
            </div>
          </div>

          {userCount > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex gap-1.5 overflow-hidden">
                {avatars.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="relative inline-block h-10 w-10 overflow-hidden rounded-full border-2 border-stone-950 bg-zinc-800 shadow-xl transition-transform hover:scale-110"
                    style={{ zIndex: avatars.length - i }}
                  >
                    <Image
                      src={url}
                      alt="User avatar"
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                ))}
                {userCount > avatars.length && (
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-stone-950 bg-zinc-800 text-[10px] font-bold text-zinc-300 shadow-xl">
                    +{userCount - avatars.length}
                  </div>
                )}
              </div>
              <p className="text-sm font-bold tracking-tight text-white">
                {t("hero.socialProof").replace("{{count}}", userCount.toLocaleString())}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/upload">
              <Button className="gap-2 bg-white px-5 py-3 text-zinc-900 hover:bg-zinc-200">
                {t("hero.cta.start")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>

        <div className={styles.demoShell} aria-label={t("hero.demo.aria")}>
          <div className={styles.demoHeader}>
            <div>
              <p className={styles.demoEyebrow}>{t("hero.demo.eyebrow")}</p>
              <h2 className={styles.demoTitle}>{t("hero.demo.title")}</h2>
            </div>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} aria-hidden="true" />
              {t("hero.demo.status")}
            </span>
          </div>

          <div className={styles.genderTabs} role="tablist" aria-label={t("hero.demo.genderTabs")}>
            {DEMO_GENDERS.map((gender) => {
              const profile = DEMO_PROFILES[gender];
              const isActive = activeDemoGender === gender;

              return (
                <button
                  key={gender}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.genderTab} ${isActive ? styles.genderTabActive : ""}`}
                  onClick={() => setActiveDemoGender(gender)}
                >
                  {t(profile.labelKey)}
                </button>
              );
            })}
          </div>

          <div className={styles.workflowLayout}>
            <div className={styles.photoFrame}>
              <Image
                key={activeDemo.originalImage}
                src={activeDemo.originalImage}
                alt={t("hero.demo.photoAlt")}
                fill
                priority
                className={styles.photoImage}
                sizes="(max-width: 1024px) 100vw, 340px"
              />
              <div className={styles.scanLine} aria-hidden="true" />
              <div className={styles.analysisCard}>
                <span className={styles.analysisStatus}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("hero.demo.analysisComplete")}
                </span>
                <dl className={styles.analysisList}>
                  <div>
                    <dt>{t("hero.demo.faceShapeLabel")}</dt>
                    <dd>{t(activeDemo.faceShapeKey)}</dd>
                  </div>
                  <div>
                    <dt>{t("hero.demo.headBalanceLabel")}</dt>
                    <dd>{t(activeDemo.headBalanceKey)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className={styles.stepList}>
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.label}
                    className={styles.workflowStep}
                    style={{ "--delay": `${index * 1.2}s` } as CSSProperties}
                  >
                    <span className={styles.stepIcon}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.gridHeader}>
            <span>{t("hero.demo.gridLabel")}</span>
            <strong>{t("hero.demo.gridReady")}</strong>
          </div>
          <div className={styles.gridBoard}>
            {activeDemo.cards.map((card, index) => (
              <article
                key={`${activeDemoGender}-${card.titleKey}`}
                className={`${styles.gridCard} ${card.featured ? styles.gridCardFeatured : ""}`}
                style={{ "--delay": `${index * 0.35}s` } as CSSProperties}
              >
                <Image
                  src={card.image}
                  alt=""
                  fill
                  className={styles.gridCardImage}
                  sizes="(max-width: 720px) 30vw, 150px"
                />
                <div className={styles.gridCardOverlay} />
                <div className={styles.scoreBadge}>{card.score}</div>
                <div className={styles.cardText}>
                  <span>{t(card.bucketKey)} / {t(card.fitKey)}</span>
                  <strong>{t(card.titleKey)}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
