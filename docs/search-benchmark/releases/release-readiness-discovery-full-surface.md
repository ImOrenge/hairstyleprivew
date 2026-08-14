# Discovery full-surface release readiness

- 작성일: 2026-08-14
- 상태: local-ready, not integrated or deployed
- branch: `feat/2026-08-14-search-discovery-pilot`
- integration target: `develop/2026-08-08-hairfit-v2-backend@3be4d8894dd3e1249808275afd001933417883c8`

## 구현된 공개 표면

`/discover` 허브와 다음 7개 SSG 경로를 구현했다.

1. `/discover/ai-hairstyle-simulation`
2. `/discover/face-shape-hairstyle`
3. `/discover/men-hairstyle-simulation`
4. `/discover/women-hairstyle-simulation`
5. `/discover/bangs-preview`
6. `/discover/bob-cut-preview`
7. `/discover/salon-consultation-image`

각 경로는 고유 SEO title·description·H1·FAQ·sample manifest·verified evidence·관련 링크 3개와 고유 decision artifact를 가진다. 공개 CTA 세 곳은 모두 정확히 `/consulting/new`다.

## 통과한 gate

| Gate | 결과 |
| --- | --- |
| Discovery contract | 12/12 pass |
| Registry/asset audit | pages 7, published 7, findings 0, blocking 0 |
| Browser matrix | 39/39 pass |
| Accessibility | 7개 경로 axe serious/critical 0 |
| Responsive | 각 경로 390px·1440px overflow 0; canary 360/390/768/1440 visual baseline |
| Failure behavior | unknown slug 404, image failure에서도 alt와 layout 유지 |
| Local performance | LCP ≤ 2.5s, CLS ≤ 0.1, observed INP ≤ 200ms |
| Production build | `/discover` static, 7개 detail SSG |
| Landing regression | premium 7/7, hero 1/1, flat 5/5, motion 3/3 |
| Consulting regression | 78/78 pass |

## 중복·도어웨이 방지

validator는 published 페이지마다 고유 intent, SEO title, H1, description, sample manifest, 단독 evidence와 artifact kind를 요구한다. 관련 링크는 공개된 다른 페이지 2~4개만 허용한다. 현재 7개 페이지는 각각 비교 지도, 얼굴 관찰, 남성 관리, 여성 길이, 앞머리 리스크, 단발 커트 사다리, Salon Brief로 정보 구조가 다르다.

## 외부 공개 전 남은 작업

1. synthetic sample provenance·권리 승인 원문의 공식 보관 위치를 확정한다.
2. 승인된 integration branch로 merge하고 push·deploy한다. 이번 작업은 이를 수행하지 않는다.
3. Search Console에 sitemap을 제출하고 색인·query baseline을 수집한다.
4. 배포 환경 RUM과 Core Web Vitals를 확인한다. 현재 성능은 로컬 관찰값이다.
5. 허용된 `landing_id` attribution과 인증 왕복 보존을 별도 P3 작업으로 구현한다.

## 판정

7개 검색 표면은 로컬 구현·검증 기준 release candidate다. 외부 provenance 승인, integration, deployment, live indexing, 실제 인증 handoff와 live RUM은 완료로 주장하지 않는다.
