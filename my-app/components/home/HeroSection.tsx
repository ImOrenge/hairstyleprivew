"use client";

import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./HeroSection.module.css";

interface HeroSectionProps {
  userCount?: number;
  avatars?: string[];
}

type RollingTile = {
  src: string;
  alt: string;
  model: string;
  kind: "hair" | "fashion";
};

type RollingColumnConfig = {
  duration: number;
  phase: number;
  direction: "up" | "down";
  tiles: RollingTile[];
};

const MODEL_TILES: Record<string, [RollingTile, RollingTile]> = {
  model01: [
    {
      src: "/hero/rolling/model-01-hair.webp",
      alt: "내추럴 쇼트 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 1",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-01-fashion.webp",
      alt: "같은 내추럴 쇼트 헤어 남성 모델의 미니멀 패션",
      model: "모델 1",
      kind: "fashion",
    },
  ],
  model02: [
    {
      src: "/hero/rolling/model-02-hair.webp",
      alt: "텍스처 보브 헤어를 보여주는 여성 모델 클로즈업",
      model: "모델 2",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-02-fashion.webp",
      alt: "같은 보브 헤어 여성 모델의 차분한 테일러링 패션",
      model: "모델 2",
      kind: "fashion",
    },
  ],
  model03: [
    {
      src: "/hero/rolling/model-03-hair.webp",
      alt: "사이드 파트 보브 헤어를 보여주는 여성 모델 클로즈업",
      model: "모델 3",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-03-fashion.webp",
      alt: "같은 보브 헤어 여성 모델의 코발트 재킷 패션",
      model: "모델 3",
      kind: "fashion",
    },
  ],
  model04: [
    {
      src: "/hero/rolling/model-04-hair.webp",
      alt: "미디엄 커튼 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 4",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-04-fashion.webp",
      alt: "같은 커튼 헤어 남성 모델의 네이비 블레이저 패션",
      model: "모델 4",
      kind: "fashion",
    },
  ],
  model05: [
    {
      src: "/hero/rolling/model-05-hair.webp",
      alt: "긴 레이어드 웨이브를 보여주는 여성 모델 클로즈업",
      model: "모델 5",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-05-fashion.webp",
      alt: "같은 레이어드 헤어 여성 모델의 버건디 데님 패션",
      model: "모델 5",
      kind: "fashion",
    },
  ],
  model06: [
    {
      src: "/hero/rolling/model-06-hair.webp",
      alt: "짧은 아이비리그 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 6",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-06-fashion.webp",
      alt: "같은 아이비리그 헤어 남성 모델의 캐멀 오버 패션",
      model: "모델 6",
      kind: "fashion",
    },
  ],
  model07: [
    {
      src: "/hero/rolling/model-07-hair.webp",
      alt: "볼륨 픽시 보브를 보여주는 여성 모델 클로즈업",
      model: "모델 7",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-07-fashion.webp",
      alt: "같은 픽시 보브 여성 모델의 블랙 블레이저 패션",
      model: "모델 7",
      kind: "fashion",
    },
  ],
  model08: [
    {
      src: "/hero/rolling/model-08-hair.webp",
      alt: "내추럴 쇼트 웨이브를 보여주는 남성 모델 클로즈업",
      model: "모델 8",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-08-fashion.webp",
      alt: "같은 쇼트 웨이브 남성 모델의 네이비 블레이저 패션",
      model: "모델 8",
      kind: "fashion",
    },
  ],
  model09: [
    {
      src: "/hero/rolling/model-09-hair.webp",
      alt: "블런트 보브 헤어를 보여주는 여성 모델 클로즈업",
      model: "모델 9",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-09-fashion.webp",
      alt: "같은 블런트 보브 여성 모델의 올리브 테일러링 패션",
      model: "모델 9",
      kind: "fashion",
    },
  ],
  model10: [
    {
      src: "/hero/rolling/model-10-hair.webp",
      alt: "텍스처 크롭 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 10",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-10-fashion.webp",
      alt: "같은 텍스처 크롭 남성 모델의 차콜 미니멀 패션",
      model: "모델 10",
      kind: "fashion",
    },
  ],
  model11: [
    {
      src: "/hero/rolling/model-11-hair.webp",
      alt: "숄더 렝스 소프트 컬을 보여주는 여성 모델 클로즈업",
      model: "모델 11",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-11-fashion.webp",
      alt: "같은 소프트 컬 여성 모델의 네이비 워크 패션",
      model: "모델 11",
      kind: "fashion",
    },
  ],
  model12: [
    {
      src: "/hero/rolling/model-12-hair.webp",
      alt: "미디엄 사이드 스윕 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 12",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-12-fashion.webp",
      alt: "같은 사이드 스윕 남성 모델의 토프 코트 패션",
      model: "모델 12",
      kind: "fashion",
    },
  ],
  model13: [
    {
      src: "/hero/rolling/model-13-hair.webp",
      alt: "긴 스트레이트 레이어를 보여주는 여성 모델 클로즈업",
      model: "모델 13",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-13-fashion.webp",
      alt: "같은 롱 레이어 여성 모델의 버건디 재킷 패션",
      model: "모델 13",
      kind: "fashion",
    },
  ],
  model14: [
    {
      src: "/hero/rolling/model-14-hair.webp",
      alt: "내추럴 컬 테이퍼 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 14",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-14-fashion.webp",
      alt: "같은 내추럴 컬 남성 모델의 포레스트 그린 패션",
      model: "모델 14",
      kind: "fashion",
    },
  ],
  model15: [
    {
      src: "/hero/rolling/model-15-hair.webp",
      alt: "소프트 픽시 헤어를 보여주는 여성 모델 클로즈업",
      model: "모델 15",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-15-fashion.webp",
      alt: "같은 소프트 픽시 여성 모델의 코발트 니트 패션",
      model: "모델 15",
      kind: "fashion",
    },
  ],
  model16: [
    {
      src: "/hero/rolling/model-16-hair.webp",
      alt: "이어 렝스 웨이브 커튼 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 16",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-16-fashion.webp",
      alt: "같은 웨이브 커튼 헤어 남성 모델의 브라운 레이어드 패션",
      model: "모델 16",
      kind: "fashion",
    },
  ],
};

const ROLLING_COLUMNS: RollingColumnConfig[] = [
  {
    duration: 40,
    phase: -36,
    direction: "up",
    tiles: [
      ...MODEL_TILES.model01,
      ...MODEL_TILES.model05,
      ...MODEL_TILES.model09,
      ...MODEL_TILES.model14,
    ],
  },
  {
    duration: 52,
    phase: -84,
    direction: "down",
    tiles: [
      ...MODEL_TILES.model02,
      ...MODEL_TILES.model06,
      ...MODEL_TILES.model10,
      ...MODEL_TILES.model13,
    ],
  },
  {
    duration: 46,
    phase: -62,
    direction: "up",
    tiles: [
      ...MODEL_TILES.model03,
      ...MODEL_TILES.model07,
      ...MODEL_TILES.model12,
      ...MODEL_TILES.model16,
    ],
  },
  {
    duration: 58,
    phase: -114,
    direction: "down",
    tiles: [
      ...MODEL_TILES.model04,
      ...MODEL_TILES.model08,
      ...MODEL_TILES.model11,
      ...MODEL_TILES.model15,
    ],
  },
];

function RollingColumn({ config, index }: { config: RollingColumnConfig; index: number }) {
  const motionStyle = {
    "--roll-duration": `${config.duration}s`,
    "--roll-phase": `${config.phase}s`,
  } as CSSProperties;

  return (
    <div className={styles.column} style={motionStyle} data-rolling-column={index + 1}>
      <div className={`${styles.track} ${config.direction === "down" ? styles.trackDown : ""}`}>
        {[0, 1].map((loopIndex) => (
          <ul
            key={loopIndex}
            className={styles.tileGroup}
            aria-hidden={loopIndex === 1 ? true : undefined}
          >
            {config.tiles.map((tile, tileIndex) => (
              <li
                className={styles.tile}
                key={`${loopIndex}-${tile.src}`}
                data-model={tile.model}
                data-kind={tile.kind}
              >
                <Image
                  src={tile.src}
                  alt={loopIndex === 0 ? tile.alt : ""}
                  fill
                  className={styles.tileImage}
                  sizes="(max-width: 640px) 25vw, (max-width: 1280px) 24vw, 272px"
                  priority={loopIndex === 0 && tileIndex === 0}
                />
                <span className="sr-only">
                  {tile.model} {tile.kind === "hair" ? "헤어" : "패션"}
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function HeroSection({ userCount = 0, avatars = [] }: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    let isInViewport = true;
    const syncPlayback = () => setIsActive(isInViewport && document.visibilityState === "visible");
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewport = entry.isIntersecting;
        syncPlayback();
      },
      { threshold: 0.08 },
    );

    observer.observe(hero);
    document.addEventListener("visibilitychange", syncPlayback);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }, []);

  const visibleAvatars = avatars.slice(0, 4);

  return (
    <section ref={heroRef} className={styles.hero} aria-labelledby="landing-hero-title">
      <div
        className={styles.visualStage}
        aria-label="헤어와 패션이 이어지는 네 줄 세로 롤링 갤러리"
        data-testid="hero-rolling-stage"
      >
        <div
          className={`${styles.columns} ${isActive ? styles.isRunning : styles.isPaused}`}
          data-testid="hero-rolling-columns"
        >
          {ROLLING_COLUMNS.map((column, index) => (
            <RollingColumn config={column} index={index} key={index} />
          ))}
        </div>
      </div>

      <div className={styles.copyBlock}>
        <p className={styles.brand}>HAIRFIT</p>
        <p className={styles.eyebrow}>
          <Sparkles className={styles.eyebrowIcon} aria-hidden="true" />
          간이 퍼스널 컬러부터 시작하는 AI 풀 스타일 컨설팅
        </p>
        <h1 id="landing-hero-title" className={styles.title}>
          사진 한 장으로 퍼스널 컬러를 찾고,{" "}
          <span>내게 맞는 헤어를 실제로 만들어 보세요.</span>
        </h1>
        <p className={styles.description}>
          사진 기반 간이 퍼스널 컬러와 워터마크 헤어 3×3을 무료로 확인합니다.
          <br className={styles.desktopBreak} /> 유료 풀코스에서는 정밀 진단·최종 헤어 1개·염색·메이크업·패션·Salon Brief까지 이어집니다.
        </p>

        <div className={styles.actions}>
          <Link href="/consulting/new" className={styles.primaryAction}>
            무료 퍼스널 컬러·3×3 시작
            <ArrowRight className={styles.actionIcon} aria-hidden="true" />
          </Link>
          <Link href="#style-dossier" className={styles.secondaryAction}>
            9가지 결과 예시 보기
          </Link>
        </div>
        <p className={styles.actionNote}>로그인 후 계정당 1회 · 실제 헤어 9개 생성 · 비교 직전 유료 전환</p>

        {(userCount > 0 || visibleAvatars.length > 0) && (
          <div className={styles.proof} aria-label="HairFit 이용자 정보">
            {visibleAvatars.length > 0 && (
              <div className={styles.avatars} aria-hidden="true">
                {visibleAvatars.map((avatar, index) => (
                  <Image
                    key={avatar}
                    src={avatar}
                    alt=""
                    width={30}
                    height={30}
                    className={styles.avatar}
                    unoptimized
                    style={{ zIndex: visibleAvatars.length - index }}
                  />
                ))}
              </div>
            )}
            {userCount > 0 ? (
              <span>{userCount.toLocaleString("ko-KR")}명이 HairFit에서 스타일 기준을 확인했어요</span>
            ) : null}
          </div>
        )}

        <a href="#analysis-evidence" className={styles.scrollCue} aria-label="SCROLL — 분석 근거 섹션으로 이동">
          <span>SCROLL</span>
          <ArrowDown aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
