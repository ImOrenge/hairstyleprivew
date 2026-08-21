# P49 Hair 9안·AI Primary UX 로컬 종료 증거

- 실행일: 2026-08-20
- 브랜치: `feat/2026-08-12-discovery-scroll`
- 시작 HEAD: `72b442045112c52c52dfa34dfb0e29526801f0d6`
- 범위: 로컬 구현·fixture browser·migration fresh chain
- 제외: commit, merge, push, 원격 migration, 배포, 실사용자 인증, 실제 이미지 provider 비용 집행

## 구현 증거

- Web은 `HairRecommendationWorkbench`에서 AI primary를 크게 표시하고 `data-hair-generated-gallery="all-nine"` 아래 9개 슬롯 전체를 항상 표시한다.
- Native는 AI-led decision이 있으면 primary와 9개 전체를 표시하고, flag/API 비활성 시 기존 shortlist 화면을 유지한다.
- primary 확정은 ready 9개와 recommendation revision을 요구하고 서버가 다음 route를 반환한다.
- 조정은 immutable adjustment row, 복제된 원본 generation draft, generation-scoped board와 증가한 board version을 사용한다.
- 기존 compare/decision deep link는 flag ON에서 recommendation workspace로 연결되고 OFF에서는 legacy workbench를 유지한다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| Hair policy·shadow·P49 UX contract | `15/15 passed` |
| Shared 전체 contract | `153/153 passed` |
| Web typecheck | `passed` |
| Native typecheck | `passed` |
| Native lint | `passed` |
| Component registry | `62 components / 62 passports / passed` |
| Migration mirror | `103/103 passed` |
| Local PostgreSQL fresh chain | `103/103 passed` |
| Browser fixture | `gallery visible`, `9 items`, `shortlist controls 0` |
| Responsive | `390/768/1440`, horizontal document overflow 없음, 각 viewport 9 items |

브라우저 fixture는 의도적으로 partial `2/9` 상태를 사용했다. 성공 2개를 완료로 오판하지 않으며 9개 슬롯의 생성·대기 상태를 모두 표시했다. 실제 생성 이미지 9개와 실인증 confirm/adjust는 이 문서의 로컬 증거가 아니다.

## 컴포넌트 안정성

- kind/status: `feature / experimental`
- change gate: `behavioral + compatible`
- global CSS 변경: 없음
- Passport: `web-consulting-hair-recommendation.yaml`, 기존 scene/native Passport 갱신
- 접근성: polite progress status, native progress, slot/primary image label, error alert

## 잔여 외부 증거

- Clerk 실사용자 owner/RLS 흐름: `not_run`
- 실제 Hair provider 9개와 조정 후 새 9개: `not_run`
- 원격 migration: `not_run`
- 배포·Canary: P53 범위

검증용 PostgreSQL 서버는 종료했다. 실행 제한으로 데이터 디렉터리 `.codex-temp/p49-fresh-pg-20260820` 삭제는 수행되지 않았다.
