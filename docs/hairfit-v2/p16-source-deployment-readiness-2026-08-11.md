# P16 HairFit V2 소스 배포 준비

- 작성일: 2026-08-11 KST
- 상태: `superseded_by_execution_result / cloudflare_size_blocked`
- 대상 Worker: `hairstyleprivew`
- 원격 변경: feature/develop push, server flags OFF와 vision model 이름 등록; source version 교체는 실패

> 이 문서는 배포 전 snapshot이다. 실제 승인·실행 결과와 현재 판정은 `p16-source-deployment-and-live-result-2026-08-11.md` 및 `p17-final-handoff-2026-08-11.md`를 따른다.

## 로컬 배포 산출물 검증

`npm --prefix my-app run cf:build`를 실행해 Next.js production build와 OpenNext Cloudflare bundle을 연속 검증했다.

| 항목 | 결과 |
|---|---|
| Next.js | 16.2.10, Webpack production compile 성공 |
| route/page 생성 | 130 / 130 |
| `/consulting/new` | 동적 route 포함 |
| 11 Scene route | `/consulting/[sessionId]/[stage]` 포함 |
| V2 APIs | analysis, evidence, personal-color, salon-brief, aftercare, fashion-batch, preview-board, selection 포함 |
| OpenNext Cloudflare | 1.20.1 bundle 성공 |
| Worker entry | `.open-next/worker.js` 생성 |
| Worker entry SHA-256 | `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45` |
| static assets | 458 files |
| GPT-4o runtime 포함 | server handler에서 `PROMPT_VISION_MODEL`, OpenAI Responses endpoint, `hairfit_face_analysis` schema 확인 |
| Git 오염 | `.open-next`/`.next`는 추적 대상에 추가되지 않음 |

빌드는 Windows OpenNext 호환성 주의, `middleware` convention deprecation, 번들 종속성의 `-0 === 0` 경고를 출력했으나 error 없이 완료됐다. 이 경고는 성공을 실환경 런타임 증거로 확대하지 않는 이유이며 canary smoke에서 다시 확인한다.

## 배포 전 강제 선행조건

현재 구현은 독립 worktree의 미커밋 변경이다. 골의 “메인 소스 revision 고정”과 rollback 계약을 지키기 위해 다음이 충족되기 전에는 배포하지 않는다.

1. P0~P16 변경 범위와 다른 사용자 변경의 overlap을 재확인한다.
2. 현재 P15 snapshot을 승인된 feature commit으로 고정한다.
3. commit SHA와 OpenNext bundle manifest를 연결한다.
4. 원격 feature branch push 후 remote SHA 일치를 확인한다.
5. 승인된 integration target에 ff-only로 반영하거나, 별도 승인된 정확한 source SHA를 배포 대상으로 고정한다.
6. Cloudflare flags는 최초 source 배포에서도 OFF를 유지한다.
7. 배포 직후 `/`, `/workspace`, 기존 생성·결제·환불 경로와 `/consulting/new` OFF 동작을 확인한다.
8. 그 뒤 별도 canary 승인에서만 build-time/public flag와 서버 flag를 단계적으로 활성화한다.

## Git read-only preflight

| 항목 | 결과 |
|---|---|
| feature branch | `feat/2026-08-08-hairfit-v2-backend` |
| 현재 HEAD | `347626045335c09606d4b05286a12d8f3ba8bb2d` |
| local integration target | `develop/2026-08-08-hairfit-v2-backend` 존재 |
| target 대비 | ahead 13, behind 0 |
| tracked modified | 65 |
| untracked | 95 |
| staged | 0 |
| 전체 변경 후보 | 160 |
| P15 snapshot 대상 | 최종 보고서·실행 골 2개 제외 158 |
| 경로 분포 | `apps` 3, `docs` 31, `my-app` 101, root package 1, `packages` 17, `supabase` 5, `tests` 2 |
| 원격 feature branch | 없음, 최초 push 필요 |
| 원격 integration target | 없음, 이번 승인 후보에서 생성하지 않음 |
| upstream | 없음 |
| staged overlap | staging 자체가 없어 없음 |
| secret/private 파일명 | 0 |
| 1 MiB 초과 변경 파일 | 0 |
| build 산출물 | `.next`/`.open-next` ignored, 후보에서 제외 |

변경 파일 콘텐츠를 private-key header, OpenAI/GitHub token, JWT, AWS access-key 형태로 이름만 출력하는 방식으로 검사했다. 검출 1건은 `.env.local.example`의 명시적 private-key placeholder였으며 실제 값이 아니다. 해당 example의 이번 diff는 `PROMPT_VISION_MODEL=gpt-4o` 한 줄이다. `gitleaks` 실행 파일은 설치돼 있지 않으므로 승인 후 staging을 만든 다음 staged diff를 같은 비노출 검사와 `git diff --cached --check`로 다시 검증한다.

ignored `node_modules`를 포함한 전체 status 열거 과정에서 Windows 장경로 경고가 발생했지만 변경 후보 파일에는 포함되지 않는다. tracked 파일의 CRLF 변환 안내 역시 기존 작업트리 설정 경고이며 `git diff --check` 오류는 아니다.

## 승인 경계

이번 로컬 빌드는 commit, push, merge, deploy, rollout flag ON, provider 호출을 승인하거나 실행하지 않는다.

다음 최소 승인 단위는 “현재 HairFit V2 작업 범위의 source revision 고정 commit과 feature branch push”다. source deploy와 canary 활성화는 그 결과 SHA를 확인한 뒤 다시 분리 승인한다.

## 종료 판정

Cloudflare bundle 생성 조건은 충족했다. 그러나 source revision이 아직 commit으로 고정되지 않았으므로 P16 source deployment readiness 전체는 `not_ready_to_deploy`다. 이 문서는 live 배포 성공, 실인증, GPT-4o 실호출 성공을 증명하지 않는다.
