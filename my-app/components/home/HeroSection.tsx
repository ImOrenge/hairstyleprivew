"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
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
      alt: "허쉬컷 헤어를 보여주는 여성 모델 클로즈업",
      model: "모델 1",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-01-fashion.webp",
      alt: "같은 허쉬컷 여성 모델의 아이보리 트렌치 패션",
      model: "모델 1",
      kind: "fashion",
    },
  ],
  model02: [
    {
      src: "/hero/rolling/model-02-hair.webp",
      alt: "텍스처 콤마 헤어를 보여주는 남성 모델 클로즈업",
      model: "모델 2",
      kind: "hair",
    },
    {
      src: "/hero/rolling/model-02-fashion.webp",
      alt: "같은 콤마 헤어 남성 모델의 차콜 테일러링 패션",
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
      alt: "같은 커튼 헤어 남성 모델의 올리브 오버셔츠 패션",
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
      alt: "같은 레이어드 헤어 여성 모델의 버건디 레더 패션",
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
      alt: "같은 아이비리그 헤어 남성 모델의 카멜 봄버 패션",
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
};

const ROLLING_COLUMNS: RollingColumnConfig[] = [
  {
    duration: 20,
    phase: -18,
    direction: "up",
    tiles: [...MODEL_TILES.model01, ...MODEL_TILES.model05],
  },
  {
    duration: 26,
    phase: -42,
    direction: "down",
    tiles: [...MODEL_TILES.model02, ...MODEL_TILES.model06],
  },
  {
    duration: 23,
    phase: -31,
    direction: "up",
    tiles: [...MODEL_TILES.model03, ...MODEL_TILES.model07],
  },
  {
    duration: 29,
    phase: -57,
    direction: "down",
    tiles: [...MODEL_TILES.model04, ...MODEL_TILES.model08],
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
                  priority={loopIndex === 0 && index < 2 && tileIndex === 0}
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
    const syncPlayback = () => {
      setIsActive(isInViewport && document.visibilityState === "visible");
    };
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
        aria-label="헤어와 패션이 이어지는 4열 4행 스타일 롤링 갤러리"
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
          AI HAIR · FASHION CONTINUITY
        </p>
        <h1 id="landing-hero-title" className={styles.title}>
          헤어를 고르면,
          <span>패션이 이어집니다</span>
        </h1>
        <p className={styles.description}>
          내 얼굴 사진 한 장으로 어울리는 헤어 9가지를 비교하고,
          <br className={styles.desktopBreak} /> 선택한 헤어에 맞는 패션 코디까지 한 흐름으로 만나보세요.
        </p>

        <div className={styles.actions}>
          <Link href="/consulting/new" className={styles.primaryAction}>
            사진으로 시작하기
            <ArrowRight className={styles.actionIcon} aria-hidden="true" />
          </Link>
          <Link href="#home-fashion" className={styles.secondaryAction}>
            결과 예시 보기
          </Link>
        </div>

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
            {userCount > 0 && <span>{userCount.toLocaleString("ko-KR")}명이 HairFit으로 스타일을 비교했어요</span>}
          </div>
        )}

        <a href="#home-fashion" className={styles.scrollCue} aria-label="다음 섹션으로 이동">
          <span>SCROLL</span>
          <ArrowDown aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
