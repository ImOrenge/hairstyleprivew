# HairFit landing page redesign run

- mode: `redesign`
- phase: `handoff`
- primary conversion: `/workspace`에서 사진 업로드 시작
- technical target: Next.js 16 App Router의 기존 `/` 경로

## Assumptions

- 기존의 헤어 9가지 비교와 선택 헤어 기반 패션 추천이라는 제품 용어와 전환 목표는 유지한다.
- 히어로는 4열 x 4행의 16개 세로 타일을 하나의 논리 배열로 사용한다.
- 각 모델은 헤어 클로즈업 다음에 동일 인물·동일 헤어의 전신 패션 컷이 이어져야 한다.
- 실사 에디토리얼 이미지를 사용하고, 이미지 테두리·라운드·상하단 투명 그라데이션을 유지한다.

## Work queue

1. 실사 모델 8명의 헤어·패션 페어 16개를 생성하고 WebP로 최적화한다.
2. 기존 복합 데모 히어로를 4열 롤링 히어로와 중앙 카피로 교체한다.
3. 나머지 랜딩 섹션에 1회성 스크롤 페이드인을 적용한다.
4. 감속 설정, 모바일/데스크톱, 빌드와 브라우저 렌더링을 검증한다.

## Findings

- `resolved / P1 / asset`: 8명의 헤어·패션 페어 16개를 생성하고 각 열에서 같은 모델의 두 컷이 연속하도록 배치했다.
- `resolved / P1 / above-fold`: 기존 조작 UI와 분석 패널을 제거하고 롤링 비주얼 아래 중앙 브랜드·가치 제안·CTA로 재구성했다.
- `resolved / P1 / mobile`: 기존 고정 CTA가 히어로 CTA를 가리던 문제를 히어로 교차 관찰 기반 노출 방식으로 수정했다.
- `resolved / P2 / motion`: 히어로 이후 주요 섹션에 1회성 스크롤 페이드인을 적용했다.

## Artifacts

- `my-app/public/hero/rolling/model-01..08-{hair,fashion}.webp`
- `my-app/components/home/HeroSection.tsx`
- `my-app/components/home/HeroSection.module.css`
- `my-app/components/home/MobileStickyCtaBar.tsx`
- `my-app/components/home/RevealOnScroll.tsx`
- `my-app/lib/landing-hero-contract.test.ts`
- `C:/Users/user/.codex/visualizations/2026/07/23/019f8f14-8d2d-7ed2-96b8-da64fbde961a/landing-hero-desktop.png`
- `C:/Users/user/.codex/visualizations/2026/07/23/019f8f14-8d2d-7ed2-96b8-da64fbde961a/landing-hero-mobile-final.png`

## Verification

- `npm run lint -- app/page.tsx components/home/HeroSection.tsx components/home/MobileStickyCtaBar.tsx components/home/RevealOnScroll.tsx`: pass
- `npm run typecheck`: pass
- `npm run landing-hero:contract:test`: pass, 4열·16개 고유 에셋·8개 모델 페어 확인
- `npm run web-image:contract:test`: pass
- `npm run build`: pass, Next.js 16.2.10 production build
- Chromium 1440 x 1000: 4열, 16개 논리 타일, 0px 가로 오버플로, 콘솔·페이지 오류 없음
- Chromium 390 x 844: 4열 유지, 0px 가로 오버플로, CTA 비가림, 콘솔·페이지 오류 없음
- `prefers-reduced-motion: reduce`: 네 열 모두 애니메이션 `none`, 정적 배열 확인
- 스크롤 페이드인: `opacity 0 / translateY(24px)`에서 `opacity 1 / transform none` 전환 확인

## Next action

검증된 기능 브랜치를 로컬 통합 대상으로 넘긴다.
