"use client";

import { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, Grid3X3, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";
import styles from "./HeroSection.module.css";

interface HeroSectionProps {
  userCount?: number;
  avatars?: string[];
}

type RecommendationDemoCard = {
  title: string;
  bucket: string;
  fit: string;
  score: string;
  image: string;
  featured?: boolean;
};

export function HeroSection({ userCount = 0, avatars = [] }: HeroSectionProps) {
  const t = useT();
  const titleLines = t("hero.title").split("\n");

  const workflowSteps = [
    { icon: Camera, label: t("hero.workflow.upload"), detail: t("hero.workflow.uploadDetail") },
    { icon: Sparkles, label: t("hero.workflow.analysis"), detail: t("hero.workflow.analysisDetail") },
    { icon: Grid3X3, label: t("hero.workflow.grid"), detail: t("hero.workflow.gridDetail") },
  ];

  const recommendationCards: RecommendationDemoCard[] = [
    {
      title: t("hero.demo.card.1.title"),
      bucket: t("hero.demo.bucket.short"),
      fit: t("hero.demo.fit.crown"),
      score: "94",
      image: "/hero/after.jpg",
      featured: true,
    },
    {
      title: t("hero.demo.card.2.title"),
      bucket: t("hero.demo.bucket.medium"),
      fit: t("hero.demo.fit.temple"),
      score: "91",
      image: "/hero/after_women.jpg",
    },
    {
      title: t("hero.demo.card.3.title"),
      bucket: t("hero.demo.bucket.long"),
      fit: t("hero.demo.fit.jawline"),
      score: "89",
      image: "/hero/befor_women.png",
    },
    {
      title: t("hero.demo.card.4.title"),
      bucket: t("hero.demo.bucket.short"),
      fit: t("hero.demo.fit.temple"),
      score: "88",
      image: "/hero/befor.png",
    },
    {
      title: t("hero.demo.card.5.title"),
      bucket: t("hero.demo.bucket.medium"),
      fit: t("hero.demo.fit.crown"),
      score: "86",
      image: "/hero/after.jpg",
    },
    {
      title: t("hero.demo.card.6.title"),
      bucket: t("hero.demo.bucket.long"),
      fit: t("hero.demo.fit.crown"),
      score: "84",
      image: "/hero/after_women.jpg",
    },
    {
      title: t("hero.demo.card.7.title"),
      bucket: t("hero.demo.bucket.short"),
      fit: t("hero.demo.fit.jawline"),
      score: "83",
      image: "/hero/befor.png",
    },
    {
      title: t("hero.demo.card.8.title"),
      bucket: t("hero.demo.bucket.medium"),
      fit: t("hero.demo.fit.jawline"),
      score: "81",
      image: "/hero/befor_women.png",
    },
    {
      title: t("hero.demo.card.9.title"),
      bucket: t("hero.demo.bucket.long"),
      fit: t("hero.demo.fit.temple"),
      score: "79",
      image: "/hero/after_women.jpg",
    },
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

          <div className={styles.workflowLayout}>
            <div className={styles.photoFrame}>
              <Image
                src="/hero/befor.png"
                alt={t("hero.demo.photoAlt")}
                fill
                priority
                className="object-cover object-center"
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
                    <dd>{t("hero.demo.faceShapeValue")}</dd>
                  </div>
                  <div>
                    <dt>{t("hero.demo.headBalanceLabel")}</dt>
                    <dd>{t("hero.demo.headBalanceValue")}</dd>
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
            {recommendationCards.map((card, index) => (
              <article
                key={`${card.title}-${card.score}`}
                className={`${styles.gridCard} ${card.featured ? styles.gridCardFeatured : ""}`}
                style={{ "--delay": `${index * 0.35}s` } as CSSProperties}
              >
                <Image
                  src={card.image}
                  alt=""
                  fill
                  className={styles.gridCardImage}
                  sizes="(max-width: 768px) 33vw, 150px"
                />
                <div className={styles.gridCardOverlay} />
                <div className={styles.scoreBadge}>{card.score}</div>
                <div className={styles.cardText}>
                  <span>{card.bucket} · {card.fit}</span>
                  <strong>{card.title}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
