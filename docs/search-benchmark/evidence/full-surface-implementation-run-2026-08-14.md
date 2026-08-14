# 검색 유입 전체 표면 구현 Run Packet

- 날짜: 2026-08-14
- Mode: `create -> inspect -> repair -> verify`
- 작업 브랜치: `feat/2026-08-14-search-discovery-pilot`
- 기준: `feat/2026-08-14-search-discovery-canary@f7c1244`
- 상태: local implementation verified, not integrated or deployed

## Goal

계획된 7개 공개 검색 유입 페이지를 정적 `/discover` 라우트로 구현하고, 페이지마다 고유 검색 의도·샘플 매니페스트·제품 근거·의사결정 아티팩트를 제공한다. canonical, JSON-LD, sitemap, robots, 내부 링크와 `/consulting/new` 전환을 하나의 레지스트리 계약으로 검증한다.

## Assumptions

| ID | 가정 | 경계 |
| --- | --- | --- |
| A-01 | 저장소의 synthetic model 자산을 로컬 공개 샘플로 사용할 수 있다. | 외부 provenance 원문 보관과 법무 승인은 별도다. |
| A-02 | 공개 CTA는 정확히 `/consulting/new`다. | 로그인 왕복 attribution과 실제 인증 handoff는 이번 범위가 아니다. |
| A-03 | 얼굴 측정은 사진 내 정규화 관찰 근거다. | 얼굴형 진단, 적합도 판정 또는 실제 cm로 표현하지 않는다. |
| A-04 | Salon Brief는 상담 대화 자료다. | 전문가 검토, 예약 승인 또는 시술 결과로 표현하지 않는다. |

## Work Queue

| ID | 작업 | 산출물 | 상태 |
| --- | --- | --- | --- |
| W-01 | canary 계약과 7개 intent 대조 | intent/message map v2 | complete |
| W-02 | 여성·남성 continuity asset 검사 | 7개 sample manifest | complete |
| W-03 | 페이지별 제품 근거 등록 | verified evidence registry | complete |
| W-04 | 7개 정적 detail과 hub 구현 | registry-driven SSG routes | complete |
| W-05 | doorway 방지 | 고유 title·H1·manifest·evidence·artifact validator | complete |
| W-06 | 사용자 피드백 반영 | 7종 의사결정 artifact와 전용 레이아웃 | complete |
| W-07 | SEO·전환 연결 | metadata·canonical·JSON-LD·sitemap·robots·CTA | complete |
| W-08 | 브라우저·회귀 검증 | 39 browser tests, landing/consulting contracts, build | complete |
| W-09 | 문서·릴리스 준비도 | 이 Run Packet과 full-surface readiness | complete |
| W-10 | 로컬 전달 커밋 | 안전한 격리 브랜치 commit | complete in delivery commit |

## 고유 아티팩트 계약

| 페이지 | 아티팩트 | 사용자가 해결하는 질문 |
| --- | --- | --- |
| D-AI-SIM | 3방향 비교 지도 | 아홉 후보를 어떤 기준으로 비교할까 |
| D-FACE | 얼굴선 관찰 맵 | 얼굴형 라벨 없이 무엇을 관찰할까 |
| D-MEN | 가르마·관리 매트릭스 | 이마 노출과 손질 루틴을 어떻게 맞출까 |
| D-WOMEN | 길이 구간표 | 길이가 생활과 유지에 무엇을 바꿀까 |
| D-BANGS | 되돌림 리스크 체크 | 자르기 전에 무엇을 확인해야 할까 |
| D-BOB | 커트 변화 사다리 | 어느 길이까지 자를 위험을 감수할까 |
| D-SALON | Salon Brief 네 필드 | 미용실에 무엇을 어떻게 전달할까 |

## Acceptance Gates

- Agentic Operation Gate: passed — 목표, 범위, 가정, 큐와 다음 행동 기록
- Copy Gate: passed — 7개 H1·description·FAQ·CTA·artifact가 고유하며 금지 주장 없음
- Design Gate: passed — 7종 artifact layout, 390/1440px overflow 0, 시각 검수 완료
- Browser Gate: passed — 39/39, axe serious/critical 0, static HTML, 404, image failure, local performance 포함
- Technical Gate: passed — typecheck, discovery 12/12, audit findings 0, production build에서 7개 SSG 확인
- Regression Gate: passed — web image 1/1, premium landing 7/7, hero 1/1, flat surface 5/5, motion 3/3, consulting 78/78
- External Release Gate: not run — integration, push, deploy, Search Console, live RUM·auth attribution은 승인 범위 밖

## Current Status

`7개 검색 유입 페이지의 로컬 구현·검증·전달 커밋 완료; 미통합·미배포`

## Next Action

`외부 provenance 보관 위치와 integration·deploy 승인 범위를 확정한다.`
