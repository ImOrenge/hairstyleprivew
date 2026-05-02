"use client";

import { CSSProperties, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, Grid3X3, Shirt, Sparkles } from "lucide-react";
import { InverseCard, InverseSection } from "../ui/Surface";
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

const SOCIAL_AVATAR_PLACEHOLDERS = [
  "from-[#d0b06a] via-[#82745a] to-[#191816]",
  "from-[#f4f1e8] via-[#8b8375] to-[#191816]",
  "from-[#b9aa8b] via-[#5f5a50] to-[#050505]",
  "from-[#a8863a] via-[#3b3934] to-[#050505]",
];

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
  const visibleAvatars = avatars.slice(0, 4);
  const visibleAvatarSlots = Math.min(4, Math.max(userCount, visibleAvatars.length));
  const placeholderAvatarCount = Math.max(0, visibleAvatarSlots - visibleAvatars.length);
  const hiddenUserCount = Math.max(0, userCount - visibleAvatars.length - placeholderAvatarCount);
  const avatarStackCount = visibleAvatars.length + placeholderAvatarCount + (hiddenUserCount > 0 ? 1 : 0);

  const workflowSteps = [
    { icon: Camera, label: t("hero.workflow.upload"), detail: t("hero.workflow.uploadDetail") },
    { icon: Sparkles, label: t("hero.workflow.analysis"), detail: t("hero.workflow.analysisDetail") },
    { icon: Grid3X3, label: t("hero.workflow.grid"), detail: t("hero.workflow.gridDetail") },
  ];

  return (
    <InverseSection as="section" className="relative overflow-hidden p-0">
      <div className="grid gap-0">
        <div className="grid min-h-[calc(100vh-9rem)] content-center gap-8 border-b border-[color-mix(in_srgb,var(--app-inverse-text)_10%,transparent)] p-5 sm:p-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.78fr)] lg:p-10 xl:gap-10">
          <div className="min-w-0 self-center">
            <p className="app-inverse-kicker">HairFit / Graphite Champagne</p>
            <h1 className="mt-4 max-w-5xl break-keep text-[2.45rem] font-black leading-[1.02] tracking-tight sm:text-5xl xl:text-6xl">
              <span className="mb-3 block text-[var(--app-accent)]">HairFit</span>
              {titleLines.map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p className="app-inverse-muted mt-5 max-w-3xl text-base font-semibold leading-7 sm:text-lg sm:leading-8">
              {t("hero.subtitle")}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/workspace"
                className="app-inverse-cta inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.04em] transition hover:opacity-90"
              >
                {t("hero.cta.start")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="#home-demo"
                className="app-inverse-ghost inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.04em] transition"
              >
                {t("hero.cta.demo")}
                <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <InverseCard className="grid content-between gap-4 p-4 sm:p-5">
            <div>
              <p className="app-inverse-kicker">Product Proof</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--app-inverse-text)]">
                AI 헤어 분석에서 패션 룩북까지 이어지는 하나의 스타일 시스템
              </h2>
              <p className="app-inverse-muted mt-3 text-sm font-semibold leading-6">
                얼굴형, 비율, 헤어 후보, 패션 방향을 같은 시각 언어로 연결합니다.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <InverseCard className="p-3">
                <p className="text-xl font-black xl:text-2xl">{t("hero.stat.photo.value")}</p>
                <p className="app-inverse-muted mt-1 text-[11px] font-semibold">{t("hero.stat.photo")}</p>
              </InverseCard>
              <InverseCard className="p-3">
                <p className="text-xl font-black xl:text-2xl">{t("hero.stat.grid.value")}</p>
                <p className="app-inverse-muted mt-1 text-[11px] font-semibold">{t("hero.stat.grid")}</p>
              </InverseCard>
              <InverseCard className="p-3">
                <p className="text-xl font-black xl:text-2xl">{t("hero.stat.analysis.value")}</p>
                <p className="app-inverse-muted mt-1 text-[11px] font-semibold">{t("hero.stat.analysis")}</p>
              </InverseCard>
            </div>

            {userCount > 0 && (
              <div className="hidden flex-wrap items-center gap-4 sm:flex">
                <div className="flex -space-x-3 overflow-visible pl-1">
                  {visibleAvatars.map((url, i) => (
                    <div
                      key={`${url}-${i}`}
                      className="relative inline-block h-10 w-10 overflow-hidden border-2 border-[var(--app-inverse)] bg-[var(--app-inverse-muted)] shadow-xl ring-1 ring-white/20 transition-transform hover:z-20 hover:scale-110"
                      style={{ zIndex: avatarStackCount - i }}
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
                  {Array.from({ length: placeholderAvatarCount }).map((_, i) => {
                    const gradient = SOCIAL_AVATAR_PLACEHOLDERS[i % SOCIAL_AVATAR_PLACEHOLDERS.length];
                    const zIndex = avatarStackCount - visibleAvatars.length - i;

                    return (
                      <div
                        key={`placeholder-${i}`}
                        className={`relative inline-flex h-10 w-10 items-center justify-center border-2 border-[var(--app-inverse)] bg-gradient-to-br ${gradient} text-[11px] font-black text-[var(--app-inverse-text)] shadow-xl ring-1 ring-white/20 transition-transform hover:scale-110`}
                        style={{ zIndex }}
                      >
                        HF
                      </div>
                    );
                  })}
                  {hiddenUserCount > 0 && (
                    <div className="app-inverse-subtle relative flex h-10 w-10 items-center justify-center border-2 border-[var(--app-inverse)] bg-[var(--app-inverse-muted)] text-[10px] font-bold shadow-xl ring-1 ring-white/20">
                      +{hiddenUserCount}
                    </div>
                  )}
                </div>
                <p className="text-sm font-bold tracking-tight text-[var(--app-inverse-text)]">
                  {t("hero.socialProof").replace("{{count}}", userCount.toLocaleString())}
                </p>
              </div>
            )}

            <p className="app-inverse-subtle flex items-center gap-1.5 text-xs font-semibold">
              <Shirt className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
              {t("hero.fashionTeaser")}
            </p>
          </InverseCard>
        </div>

        <div className="p-3 sm:p-5" id="home-demo">
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
                sizes="(max-width: 1024px) 100vw, 360px"
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

          <div className={styles.gridPanel}>
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
                    alt={`${t(card.titleKey)} ${t(card.bucketKey)} 헤어스타일 AI 미리보기`}
                    fill
                    className={styles.gridCardImage}
                    sizes="(max-width: 720px) 30vw, (max-width: 1280px) 22vw, 260px"
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
        </div>
      </div>
    </InverseSection>
  );
}
