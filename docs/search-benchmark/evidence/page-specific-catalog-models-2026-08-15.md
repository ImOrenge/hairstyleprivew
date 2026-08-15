# 검색 유입 페이지별 카탈로그 모델 자산 실행 기록

- 작성일: 2026-08-15
- 생성 모드: `imagegen` identity-preserve edit
- 카탈로그 정본: `my-app/data/hairstyle-blueprints/v4/*.json`
- 적용 범위: 7개 `/discover/*` 페이지의 원본 모델과 9개 비교 후보

## 문제와 판정

기존 구현은 여성 6개 페이지가 두 continuity set을 교차 재사용했고, 후보 설명도 HairFit 카탈로그 ID와 연결되지 않았다. 첫 재생성 시도 역시 범용 헤어 명칭으로 보드를 구성해 카탈로그 근거가 없었으므로 폐기했다. 최종 자산만 저장소에 반영했으며, 모든 후보를 catalog-v4의 실제 `slug`, `nameKo`, 실루엣·질감 조건에 연결했다.

## 페이지별 모델 계약

| Page | 기준 모델 | 원본 | 최종 자산 루트 |
| --- | --- | --- | --- |
| D-AI-SIM | model-03 | `public/hero/rolling/model-03-hair.webp` | `public/discovery/models/ai-hairstyle-simulation/` |
| D-FACE | model-05 | `public/hero/rolling/model-05-hair.webp` | `public/discovery/models/face-shape-hairstyle/` |
| D-MEN | male demo | `public/hero/demo/male-original.webp` | `public/discovery/models/men-hairstyle/` |
| D-WOMEN | model-07 | `public/hero/rolling/model-07-hair.webp` | `public/discovery/models/women-hairstyle/` |
| D-BANGS | model-09 | `public/hero/rolling/model-09-hair.webp` | `public/discovery/models/bangs-hairstyle/` |
| D-BOB | model-11 | `public/hero/rolling/model-11-hair.webp` | `public/discovery/models/bob-hairstyle/` |
| D-SALON | model-13 | `public/hero/rolling/model-13-hair.webp` | `public/discovery/models/salon-consultation/` |

7개 source `personId`는 모두 다르다. 한 페이지 안에서는 source와 9개 preview가 같은 `personId`를 사용하며, 다른 페이지의 source·preview 경로를 재사용하지 않는다.

## 카탈로그 선택 축

| Page | 3×3 선택 축 |
| --- | --- |
| D-AI-SIM | 단·중·장 길이별 대표 catalog-v4 실루엣과 직모·웨이브·강한 곱슬 비교 |
| D-FACE | 길이별 jawline·temple·crown `correctionFocus` 비교 |
| D-MEN | short·medium·long 카탈로그와 직모·웨이브·컬 비교 |
| D-WOMEN | 여성 short·medium·long의 서로 다른 catalog-v4 스타일 패밀리 |
| D-BANGS | `no fixed bangs`·`soft fringe`·`curtain fringe`를 길이별 비교 |
| D-BOB | short bob·medium lob·길이 유지 대조 후보 |
| D-SALON | `maintenanceLevel` low·medium·high를 길이별 비교 |

정확한 63개 slug와 한글명은 `my-app/lib/discovery/sample-manifests.ts`가 정본이다. 테스트는 이 값을 실제 catalog-v4 JSON과 대조한다.

## 생성 프롬프트 계약

모든 보드는 다음 공통 프롬프트를 사용했다.

1. 참조 이미지의 동일 인물·연령·얼굴·표정·의상·배경·조명을 9개 패널에서 유지한다.
2. 정방형 3×3, 동일 크기, 텍스트·라벨·워터마크 없는 접촉 시트로 만든다.
3. 패널별로 선택한 catalog-v4 slug와 해당 `promptTemplate`의 길이·실루엣·질감 조건만 헤어에 적용한다.
4. 기존 자연 모발 색을 유지하고 실제 미용실에서 가능한 결과만 표현한다.
5. 얼굴 변화, 다른 인물, 포즈·의상·배경 변경, 추가 인물을 금지한다.

남성 첫 생성안은 탈색 조건을 실제 색상 변경으로 과도하게 해석해 폐기했다. 최종 보드는 일반 모발 카탈로그 항목만 사용해 9개 패널 모두 자연 흑발을 유지했다.

## 후처리와 UI 연결

- `scripts/split-discovery-boards.mjs`가 생성된 정방형 보드를 정확한 3×3 좌표로 분할한다.
- 원본은 `source.webp`, 서비스 후보는 `preview-01.webp`부터 `preview-09.webp`까지 저장한다. 생성 보드 원본은 Codex 생성 이력에 보존하고 공개 번들에는 복사하지 않는다.
- `SampleComparison`은 임시 B-1식 코드 대신 `CATALOG V4`와 실제 `catalogNameKo`를 표시한다.
- `DiscoverySampleAsset`은 `catalogStyleSlug`, `catalogNameKo`, `catalogVersion`을 가진다.

## 검증 계약

- 모든 7개 manifest는 source 1개, preview 9개, OG 1개를 가진다.
- 7개 source `personId`는 고유하다.
- 63개 preview 경로는 페이지 간 중복되지 않는다.
- 한 manifest의 source와 preview는 같은 `personId`를 사용한다.
- 63개 `catalogStyleSlug`가 실제 catalog-v4 JSON에 존재하고 `nameKo`가 일치한다.
- 저장된 파일 크기와 manifest의 byte 계약이 일치한다.

## 실행 결과

- 검색 discovery 계약: 15/15 통과
- TypeScript: 통과
- 범위 ESLint: 오류 0건; CSS는 ESLint 비대상 경고 1건
- Next.js production build: 7개 `/discover/[slug]` 정적 경로 포함, 통과
- Playwright Chromium: 40/40 통과
- 브라우저 검증: 7개 source 모델 ID 고유, 페이지당 catalog-v4 캡션 9개, serious/critical 접근성 위반 없음, 390px·1440px 가로 overflow 없음
- 시각 검수: 데스크톱 sample comparison에서 9개 실제 카탈로그 한글명과 동일 인물 후보가 읽히며, 모바일 앞머리 페이지도 레이아웃 붕괴 없이 표시됨
