# P15 최종 로컬 종합 검증 진행 보고

- 검증일: 2026-08-11 KST
- 작업 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 작업 기준 HEAD: `347626045335c09606d4b05286a12d8f3ba8bb2d`
- legacy/main 소스 기준: `40c6f753e6c5b1e8e5913f2ec542f0f4b27e2501`
- 미커밋 구현 snapshot: 보고서·실행 골 문서를 제외한 변경/신규 158개 파일의 정렬된 `SHA-256 + 상대 경로` 목록 SHA-256 `e5749b7048bdfcea23913369840b6991f3a9c5778a6693ec2dbe1e74884e004e`
- 판정: `implementation_complete`
- 제품 경계: 사용자에게 유료 생성 여부, 견적 또는 결제 승인을 묻지 않는다. 방향 확정 뒤 entitlement·usage·멱등 검증은 서버 내부에서 수행한다.

## 이번 검증 범위

원본 프론트 요구서의 11 Scene과 단계별 수용조건 55개를 현재 정적 계약, 컴포넌트, 빌드와 Chromium E2E에 대조했다. DOCX 본문은 OOXML로 구조 검토하고 Microsoft Word의 실제 창 렌더링 52페이지를 전수 스캔했다. 상세 증거는 `p15-docx-visual-qa-2026-08-11.md`에 있다.

## 요구서 괴리율

점수는 `충족 1 / 부분 0.5 / 미충족 0`으로 계산한다. 총점은 `53 / 55`, 기능 요구서 괴리율은 `3.6%`다. 이는 정적 구현과 로컬 테스트 기준이며 실인증·실데이터·provider 품질을 의미하지 않는다.

| Scene | 점수 | 남은 괴리 또는 근거 |
|---|---:|---|
| 01 Discovery | 4.5 / 5 | 단독 인터뷰·자동 저장·직접 전환은 구현. 불완전 입력 CTA 사유 표현은 부분 충족 |
| 02 Photo | 5 / 5 | 8축 사전검사·private upload·얼굴 기반 4:5 crop·사용자 위치 조정·자연광 보조 사진·자동 분석 구현 |
| 03 Scan | 4.5 / 5 | 실제 task·저장 landmark·pipeline·수동 보정 구현. 실사진 정밀도는 미검증 |
| 04 Analysis | 5 / 5 | 사진·근거·ledger·Personal Color·Direction과 저장된 measurement 기반 비율 matrix 구현 |
| 05 Direction | 5 / 5 | evidence 기반 8축과 확정 revision 구현 |
| 06 Preview | 5 / 5 | durable 3x3, partial, polling, shortlist와 자동 handoff 구현 |
| 07 Compare | 5 / 5 | 동일 4:5 crop과 8개 비교축 구현 |
| 08 Decision | 4.5 / 5 | feasibility·maintenance·immutable snapshot 구현. 일부 충돌 설명은 부분 충족 |
| 09 Brief | 5 / 5 | 자동 초안·편집 revision·공유·디자이너 feedback 별도 revision 구현 |
| 10 Aftercare | 4.5 / 5 | 실제 시술 기반 timeline·사진·만족도 구현. concern patch 운영 검증 미완료 |
| 11 Fashion | 5 / 5 | 단독 인터뷰·9-look 단일 batch·shortlist 비교 matrix·최종 선택 구현 |

## 능동형 AI 컨설턴트 UX 괴리율

기존 분석의 핵심 22개 능동 UX 계약을 같은 방식으로 재채점했다. 로컬 정적·브라우저 기준 `22 / 22`, 괴리율은 `0%`다.

- 충족: 공통 Next 제거, 저장→Next 이중 동작 제거, server-owned allowed/recommended stage, 진입 즉시 evidence 로드, signed URL 복구, 실제 Scan task, 분석 완료 자동 handoff, partial 결과, waiting completion, exit/resume, Brief 자동 생성, 실제 시술 기반 Aftercare, Fashion 단일 batch, Photo crop·자연광 보조 입력, Analysis 비율 matrix 등 22개

수동 확인은 전략·방향·최종 선택·실제 시술처럼 결과를 바꾸는 결정에만 남긴다. 유료 생성 확인은 점수 항목과 종료조건에서 제외한다.

## 현재 소스 재검증 결과

| 검증 | 결과 |
|---|---|
| shared contract | 85 / 85 통과 |
| consulting contract | 73 / 73 통과 |
| HairFit V2 contract | 15 / 15 통과 |
| Expo Jest | 41 suites, 175 tests 통과 |
| workspace typecheck | 통과 |
| lint | error 0, 기존 `Array<T>` style warning 1 |
| global CSS contract | 9 / 9 통과 |
| paid action contract | 20 / 20 통과 |
| billing content contract | 15 / 15 통과 |
| result UX | 11 / 11 통과 |
| styling workflow | 7 / 7 통과 |
| component registry/passport | 54 / 54, stable 13 통과 |
| migration mirror | 85개 일치 |
| native PostgreSQL fresh-chain | 85개 migration 통과 |
| existing-schema upgrade probe | V2 도입 직전 fixture 보존 통과 |
| HairFit V2 DB behavior | RLS/RPC, entitlement 경쟁, 9-slot 정산, Capability lease·fence·retry, selection replay, 삭제 cascade 통과 |
| Next production build flags OFF | 130 pages 통과 |
| Next production build flags ON | 130 pages 통과 |
| Next production build after `gpt-4o` routing | 130 pages 통과 |
| OpenNext Cloudflare bundle after `gpt-4o` routing | Worker + 458 assets 생성, server handler에 OpenAI vision runtime 포함 |
| Next E2E build | 130 pages 통과 |
| Expo bundle | Web 1121, iOS 1403, Android 1427 modules 통과 |
| consultation Chromium E2E | 20 / 20 통과 |
| accessibility | 11 Scene + waiting + 390/768px + 200% 상당 뷰포트에서 serious/critical axe 0 |
| waiting performance | meaningful state 300ms 이하, long task 0, layout shift 0, animation network request 0 |
| 원본 DOCX 시각 QA | Word 52 / 52 페이지와 대표 상세 페이지 통과 |
| P16 live readiness preflight | 비밀값 비노출 계약 5 / 5 통과, OpenAI vision credential 포함 Cloudflare 서버 설정 32 / 32 READY |
| P16 Cloudflare OFF 등록 | 승인 범위의 서버 rollout flag 25 / 25를 명시적 `false`로 등록, 값 비노출·`NEXT_PUBLIC_`/model/Supabase/source deploy 무변경 |
| P16 Supabase 적용 게이트 | linked fingerprint·mirror·82→85·정확한 3개 dry-run·확인 토큰을 강제하는 fail-closed 실행기 4 / 4 통과, 기본 모드 원격 접근 없음 |
| P16 Supabase CLI 실출력 | JSON/Unicode table/ANSI와 legacy 8~14자리 version parser 5 / 5, linked 실제 stdout에서 remote 82·pending exact 3 확인 |
| P16 Supabase post-apply 게이트 | read-only SQL로 history/table/RPC/forced RLS/grant/security-invoker/index 검증, Data API 7개 table·RPC의 service-role 성공/anon `42501` 거부 계약 3 / 3 통과 |
| P16 Supabase 원격 적용 | 승인된 3 / 3 적용, remote 82→85, SQL 구조·Data API/schema cache·advisor 통과, HairFit 신규 WARN 0 |
| P16 vision model 등록 게이트 | 사용자 지정 `gpt-4o`, OpenAI Responses image·structured output 분기·실행 경로 4 / 4와 exact Worker·단일 payload·확인 토큰·제외 키 3 / 3 통과, 승인된 단일 이름 원격 등록 후 32 / 32 |
| Supabase exposed function 보안 | 신규 운영 RPC 2개를 불필요한 `SECURITY DEFINER`에서 `SECURITY INVOKER`로 변경, PostgREST schema reload 포함, native 85 migration fresh-chain·HairFit DB 행동 재검증 통과 |
| local Markdown links | broken link 0 |
| diff whitespace | 오류 없음, CRLF 경고만 존재 |

첫 flags OFF build 시도는 120초 제한으로 결과를 얻지 못해 `timeout/not-evidenced`로 기록했고 재실행은 통과했다. E2E 20개는 11 Scene, 키보드 접근 가능한 독립 스크롤, 단독 인터뷰, 유료 확인 부재, Photo crop·자연광 보조 입력, exit, partial, waiting/reduced motion, 자동 handoff, landmark, 실제 measurement 기반 Analysis 비율 matrix, Fashion 단일 9-slot batch, 실제 시술 Aftercare, 자동 Brief, 390/768px와 200% 상당 뷰포트를 포함한다.

## 로컬 도구 차이 기록

로컬 PostgreSQL 설치에는 pgTAP 확장이 없어 pgTAP 형식 harness 자체는 `not_run`이다. 그러나 그 harness의 27개 구조 assertion을 native PostgreSQL 직접 SQL로 실행했고, 여기에 실제 lease claim·만료 reclaim·stale fence 거부·단일 result 저장·retryable failure reclaim·idempotency 중복 거부를 추가해 통과했다. Docker나 특정 test-output 포맷을 제품 종료조건으로 두지 않으며, 동일 불변식의 실제 DB 행동 증거로 P15 DB 게이트를 충족한다.

E2E 종료 시 Clerk가 middleware 사용을 감지하지 못했다는 서버 오류가 한 번 기록됐다. 테스트 harness의 17개 시나리오는 통과했지만 이를 실인증 증거로 사용하지 않는다.

## 원격·실환경 `not_run`

승인된 원격 read-only inventory·dry-run·RLS/grant·Storage·advisor 진단은 통과했고 `p16-read-only-remote-diagnostic-2026-08-11.md`에 기록했다. 이어 별도 승인 범위에서 Cloudflare 서버 rollout flag 25개를 명시적 `false`로 등록했고 `p16-cloudflare-off-registration-2026-08-11.md`에 기록했다. 다시 별도 승인된 Supabase migration 3개를 적용해 remote 85개, SQL 구조·PostgREST schema cache·service-role/anon 권한·advisor를 통과했고 `p16-supabase-migration-apply-result-2026-08-11.md`에 기록했다. 이후 `PROMPT_VISION_MODEL=gpt-4o` 단일 이름을 별도 승인으로 등록해 OpenAI vision credential을 포함한 필수 서버 설정은 32 / 32 READY다. source deployment와 다음 비용 발생 항목은 여전히 `not_run`이다.

- Clerk 실인증과 실제 사용자 사진 upload
- live AI 분석·landmark 품질
- 실제 hair/Fashion 9-slot provider 생성과 entitlement 소비·복구
- Web canary, Expo 실기기, 배포·rollback

위 작업은 별도 승인 전에는 실행하지 않는다. Docker는 종료조건이 아니다.

## 다음 판정

P15 로컬 게이트는 `implementation_complete`다. P14의 원격 운영 smoke 체크와 P16·P17 phase 자체는 아직 닫지 않았다. 이 판정은 원격 migration, 실인증, live AI/provider, 실기기나 배포 완료를 뜻하지 않는다. 승인된 P16 원격·실환경 검증과 P17 cutover·인계까지 끝나야 `goal_complete`다.
