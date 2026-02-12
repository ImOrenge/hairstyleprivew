"use client";

import { CSSProperties, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/Button";
import { useT } from "../../lib/i18n/useT";
import styles from "./HeroSection.module.css";

type GenderKey = "male" | "female";

interface HeroSectionProps {
  userCount?: number;
  avatars?: string[];
}

export function HeroSection({ userCount = 0, avatars = [] }: HeroSectionProps) {
  const t = useT();
  const [activeGender, setActiveGender] = useState<GenderKey>("male");

  const PREVIEW_BY_GENDER: Record<GenderKey, { label: string; beforeImage: string; afterImage: string; prompt: string }> = {
    male: {
      label: t("hero.gender.male"),
      beforeImage: "/hero/befor.png",
      afterImage: "/hero/after.jpg",
      prompt: t("hero.prompt.male"),
    },
    female: {
      label: t("hero.gender.female"),
      beforeImage: "/hero/befor_women.png",
      afterImage: "/hero/after_women.jpg",
      prompt: t("hero.prompt.female"),
    },
  };

  const activePreview = PREVIEW_BY_GENDER[activeGender];
  const typewriterStyle = {
    "--type-ch": `${activePreview.prompt.length}ch`,
  } as CSSProperties & Record<"--type-ch", string>;

  const titleLines = t("hero.title").split("\n");

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-slate-800 to-zinc-700 p-6 text-white sm:p-10">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.28),transparent_42%),radial-gradient(circle_at_80%_14%,rgba(186,230,253,0.2),transparent_40%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-200">{t("hero.badge")}</p>
          <h1 className="mt-4 min-h-[4rem] text-3xl font-black leading-tight tracking-tight sm:min-h-[8rem] sm:text-5xl">
            {titleLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-4 min-h-[3rem] max-w-xl text-sm leading-6 text-zinc-100 sm:min-h-[4rem] sm:text-base">
            {t("hero.subtitle")}
          </p>

          {/* Social Proof Indicator */}
          {userCount > 0 && (
            <div className="mt-8 flex items-center gap-4">
              <div className="flex gap-1.5 overflow-hidden">
                {avatars.map((url, i) => (
                  <div
                    key={i}
                    className="relative inline-block h-10 w-10 overflow-hidden rounded-full border-2 border-slate-800 bg-zinc-800 shadow-xl transition-transform hover:scale-110"
                    style={{ zIndex: avatars.length - i }}
                  >
                    <Image
                      src={url}
                      alt="User avatar"
                      fill
                      className="object-cover"
                    />
                  </div>
                ))}
                {userCount > avatars.length && (
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-800 bg-zinc-800 text-[10px] font-bold text-zinc-300 shadow-xl backdrop-blur-md">
                    +{userCount - avatars.length}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-zinc-300">
                {t("hero.socialProof").replace("{{count}}", userCount.toLocaleString())}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/upload">
              <Button className="bg-white text-zinc-900 hover:bg-zinc-200">{t("hero.cta.start")}</Button>
            </Link>
          </div>
        </div>

        <div className={styles.previewShell}>
          <div className={styles.genderTabs} role="tablist" aria-label="Preview gender toggle">
            {(Object.keys(PREVIEW_BY_GENDER) as GenderKey[]).map((genderKey) => {
              const isActive = genderKey === activeGender;
              return (
                <button
                  key={genderKey}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.genderTab} ${isActive ? styles.genderTabActive : ""}`}
                  onClick={() => setActiveGender(genderKey)}
                >
                  {PREVIEW_BY_GENDER[genderKey].label}
                </button>
              );
            })}
          </div>

          <div key={activeGender} className={styles.comparisonCard}>
            <Image
              src={activePreview.beforeImage}
              alt={`${activePreview.label} ${t("hero.alt.before")}`}
              fill
              priority
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 520px"
            />

            <div className={styles.afterLayer} aria-hidden="true">
              <Image
                src={activePreview.afterImage}
                alt=""
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 520px"
              />
            </div>

            <div className={styles.scanDivider} aria-hidden="true" />
            <span className={`${styles.tag} ${styles.before}`}>{t("hero.tag.before")}</span>
            <span className={`${styles.tag} ${styles.after}`}>{t("hero.tag.after")}</span>
          </div>

          <div className={styles.promptBox} aria-label="Style change prompt">
            <span className={styles.promptPrefix}>prompt:</span>
            <span key={activeGender} className={styles.typewriter} style={typewriterStyle}>
              {activePreview.prompt}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
