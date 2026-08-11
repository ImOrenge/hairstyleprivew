# P16 Cloudflare HairFit 서버 Flag OFF 등록 증거

- 실행일: 2026-08-11 KST
- 사용자 승인: Cloudflare Web Worker의 HairFit V2 서버 rollout flag OFF 등록
- 대상 Worker: `hairstyleprivew`
- 판정: `server_flags_off_registered / migration_not_applied / live_not_run`

## 변경 범위

Wrangler `secret bulk`의 stdin 입력으로 HairFit V2 서버 rollout flag 25개를 모두 문자열 `false`로 등록했다.

- 등록 전 해당 flag 이름: 0 / 25
- 등록 후 해당 flag 이름: 25 / 25
- credential, provider key, secret 값 출력: 없음
- `NEXT_PUBLIC_` build-time 값 변경: 없음
- `PROMPT_VISION_MODEL` 변경: 없음
- Supabase migration·데이터 변경: 없음
- 소스 deploy 명령 실행: 없음

Cloudflare secret 구성 변경 자체는 Worker 설정 변경이다. 소스 배포와 동일하다고 기록하지 않으며 공개 경로의 상태를 별도로 재검증했다.

## 사후 검증

| 검증 | 결과 |
|---|---|
| Cloudflare 필수 서버 secret 이름 | 30 / 31 |
| 남은 누락 | `PROMPT_VISION_MODEL` |

이 표는 OFF 등록 당시의 31-name 계약 실행 기록이다. 이후 사용자가 vision model을 `gpt-4o`로 지정해 `OPENAI_API_KEY`를 readiness 필수 이름으로 명시한 현재 계약은 31 / 32이며, 동일하게 누락은 `PROMPT_VISION_MODEL` 하나다.
| `/` | HTTP 200 |
| `/workspace` | HTTP 307, 로그인으로 이동 |
| `/consulting/new` | HTTP 404 |
| 원격 Supabase migration | 82, 변경 전과 동일 |

공개 동작은 OFF 등록 전과 동일하다. `/consulting/new`가 계속 404이므로 신규 AI Consultant 경로가 우발적으로 노출되지 않았다.

## 등록 대상 불변식

- 정확한 Worker 이름이 아니면 실행을 거부한다.
- `--apply`와 exact confirmation token이 함께 없으면 원격 접근 없이 plan만 출력한다.
- payload에는 25개 서버 rollout flag와 `false`만 포함한다.
- `NEXT_PUBLIC_`, model, credential, paid-generation confirmation key를 payload에 포함하지 않는다.
- bulk 실행 후 secret 이름을 다시 조회해 25/25가 아니면 실패 처리한다.

계약 테스트 4개와 전체 consulting 계약 56/56, ESLint가 통과했다.

## 다음 경계

서버 기능은 명시적 OFF 상태다. 승인된 3개 migration은 additive이며 이 상태에서 적용할 수 있다. `PROMPT_VISION_MODEL`은 migration 적용 조건이 아니라 canary/live provider 활성화 전 필수 조건으로 유지한다.

다음 단계는 별도 승인 아래 세 Supabase migration을 적용하고 즉시 migration history, table/RLS/grant, RPC privilege, advisor와 schema cache를 재검증하는 것이다. migration 적용 승인에는 flag ON, 소스 배포, 실사진·AI 호출을 포함하지 않는다.
