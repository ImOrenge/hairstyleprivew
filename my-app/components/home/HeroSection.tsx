"use client";

import { CSSProperties, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/Button";
import styles from "./HeroSection.module.css";

const PREVIEW_BY_GENDER = {
  male: {
    label: "남자",
    beforeImage: "/hero/befor.png",
    afterImage: "/hero/after.jpg",
    prompt: "손흥민 가일컷 스타일로 바꿔줘",
  },
  female: {
    label: "여자",
    beforeImage: "/hero/befor_women.png",
    afterImage: "/hero/after_women.jpg",
    prompt: "긴 머리 히피펌으로 바꿔줘",
  },
} as const;

type GenderKey = keyof typeof PREVIEW_BY_GENDER;

export function HeroSection() {
  const [activeGender, setActiveGender] = useState<GenderKey>("male");
  const activePreview = PREVIEW_BY_GENDER[activeGender];
  const typewriterStyle = {
    "--type-ch": `${activePreview.prompt.length}ch`,
  } as CSSProperties & Record<"--type-ch", string>;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-slate-800 to-zinc-700 p-6 text-white sm:p-10">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.28),transparent_42%),radial-gradient(circle_at_80%_14%,rgba(186,230,253,0.2),transparent_40%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-200">StyleMirror</p>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            한 줄 프롬프트로
            <br />
            헤어스타일 변화를 바로 확인하세요
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-100 sm:text-base">
            업로드한 얼굴 사진 위에 원하는 스타일을 즉시 오버레이해서, 시술 전에 결과를 직관적으로 확인할 수 있습니다.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/upload">
              <Button className="bg-white text-zinc-900 hover:bg-zinc-200">무료로 시작하기</Button>
            </Link>
            <Link href="/generate">
              <Button variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                데모 생성 보기
              </Button>
            </Link>
          </div>
        </div>

        <div className={styles.previewShell}>
          <div className={styles.genderTabs} role="tablist" aria-label="미리보기 성별 전환">
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
              alt={`${activePreview.label} 변경 전 헤어스타일`}
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
            <span className={`${styles.tag} ${styles.before}`}>Before</span>
            <span className={`${styles.tag} ${styles.after}`}>After</span>
          </div>

          <div className={styles.promptBox} aria-label="스타일 변경 요청 프롬프트">
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
