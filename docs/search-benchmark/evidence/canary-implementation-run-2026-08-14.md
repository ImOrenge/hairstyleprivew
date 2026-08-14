# D-AI-SIM canary 구현 run packet

## Mode

`create`

## User Goal

검색 사용자가 업로드 없이 HairFit의 3개 전략과 9개 헤어 후보를 비교하고, 검증된 설명을 확인한 뒤 `/consulting/new`로 이동할 수 있는 정적 검색 유입 페이지를 구현한다.

## Known Context

- primary checkout: `D:\HariStyle-Preview`, `main@b33c33c`, 사용자 소유 untracked 파일이 있어 변경하지 않는다.
- implementation worktree: `D:\HariStyle-Preview-worktrees\feat-2026-08-14-search-discovery-canary`
- work branch/start: `feat/2026-08-14-search-discovery-canary@cfcbbda`
- integration target: `develop/2026-08-08-hairfit-v2-backend@3be4d88`
- ancestry: integration target은 work branch의 조상이다.
- premium landing baseline: `feat/2026-08-12-premium-landing-refactor@e86e40d`
- highest authorization boundary: local prepare. merge, push, deploy, cleanup은 범위 밖이다.

## Assumptions

| ID | Assumption | Risk | Confirmation Needed |
| --- | --- | --- | --- |
| A-01 | 기존 프리미엄 랜딩에서 공개 사용되고 정체성 연속성·중복·브라우저 로드가 검증된 synthetic `female-v2` 3×3 자산을 canary sample로 사용할 수 있다. | 저장소에 별도 법무 승인서 원문은 없다. | 외부 공개 전 자산 provenance/권리 문서 보관 위치 확인 |
| A-02 | D-AI-SIM의 primary conversion은 현재 랜딩과 동일한 `/consulting/new`다. | PR-1은 attribution을 저장하지 않는다. | 아니오 |
| A-03 | 검색 페이지는 로그인·쿠키·DB와 무관한 정적 Server Component여야 한다. | 개인화 문구는 canary에 포함할 수 없다. | 아니오 |

## Work Queue

| ID | Phase | Task | Exit Condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| W-01 | intake | base·integration target·message map·sample provenance 고정 | exact SHA, intent, asset refs 기록 | 이 문서, baseline, YAML | complete |
| W-02 | produce | registry·sample·evidence·audit 구현 | publish invariant와 invalid fixture가 동작 | unit/contract/audit | complete |
| W-03 | produce | hub/detail/metadata/JSON-LD/sitemap/UI 구현 | 정적 route와 CTA가 build에 생성 | build output | complete |
| W-04 | inspect | landing·consulting 회귀와 browser matrix 실행 | 신규 회귀 P0/P1 0 | command/browser reports | complete |
| W-05 | repair | 발견된 P0/P1 수정 및 재검증 | P0/P1 0, P2 제한 기록 | before/after evidence | complete |
| W-06 | handoff | canary release readiness 기록 | 내부 완료와 외부 미완료 분리 | release readiness | complete |

## Acceptance Gates

- Agentic Operation Gate: 이 run packet으로 관리한다.
- Copy Gate: message map과 금지 주장 audit가 통과해야 한다.
- Design Gate: 첫 viewport에 HairFit, 문제, 9개 비교 결과, CTA, 다음 섹션 힌트가 보여야 한다.
- Browser Gate: 360×800, 390×844, 768×1024, 1440×900, 정적 HTML, axe, 404, 이미지 실패 검증을 통과했다.
- Technical Gate: static build, 404, canonical, JSON-LD, sitemap, axe, console, asset 검증이 필요하다.
- Fix Gate: browser/contract에서 발견한 최고 우선순위 문제를 수정하고 재검증해야 한다.

## Current Status

`local implementation and verification complete`

## Next Action

외부 공개 전 sample provenance·권리 문서 보관 위치를 확정한 뒤 승인된 integration·deploy 절차로 넘긴다. 이번 범위에서는 merge·push·deploy를 수행하지 않는다.
