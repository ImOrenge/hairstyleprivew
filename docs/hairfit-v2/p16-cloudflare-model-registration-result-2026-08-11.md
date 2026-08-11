# P16 Cloudflare vision model 등록 결과

- 실행일: 2026-08-11 KST
- 상태: `model_name_registered / source_not_deployed / live_provider_not_run`
- 대상 Worker: `hairstyleprivew`
- 승인 범위: `PROMPT_VISION_MODEL=gpt-4o` 단일 이름 등록

## 적용 결과

| 항목 | 결과 |
|---|---|
| 확인 토큰 | `HAIRFIT_V2_PROMPT_VISION_MODEL_GPT_4O` 일치 |
| 적용 payload | `PROMPT_VISION_MODEL` 1개 |
| 등록 전 이름 존재 | no |
| 등록 후 이름 존재 | yes, 1 / 1 |
| Cloudflare 필수 서버 이름 | 32 / 32 READY |
| 다른 secret 값 출력 | 없음 |
| rollout flag 변경 | 없음, 기존 25개 OFF 유지 |
| `NEXT_PUBLIC_` 변경 | 없음 |
| source deployment | 없음 |
| provider API 호출 | 없음 |
| Supabase 변경 | 없음 |

## 실행 전 로컬 계약

- `PROMPT_VISION_MODEL`이 얼굴 분석 실행 모델의 최우선 권위 값이다.
- `gpt-4o`는 OpenAI Responses API의 `input_image`와 strict JSON schema 경로를 선택한다.
- Capability provenance의 provider/model은 `openai`/`gpt-4o`로 정렬된다.
- Gemini 모델을 설정한 경우에는 기존 Gemini SDK 경로를 유지한다.
- 상담 contract 73 / 73, TypeScript, ESLint, Next production build 130 pages를 통과했다.

## 적용 후 불변식

| 항목 | 결과 |
|---|---|
| `https://hairfit.beauty/` | HTTP 200 |
| `https://hairfit.beauty/workspace` | HTTP 307, login redirect |
| `https://hairfit.beauty/consulting/new` | HTTP 404 |
| Supabase remote migration | 85, 최신 `20260811154500` 존재 |

공개 `/consulting/new`가 404인 것은 source deployment와 build-time/public flag 변경을 승인 범위에서 제외했기 때문이다. 모델 이름 등록만으로 신규 상담이나 provider 호출이 열리지 않는다.

## 남은 승인 경계

다음 단계는 소스 배포·canary 설정과 실인증·실사진·live provider 호출을 포함하므로 별도 승인과 비용·개인정보 범위가 필요하다. 이 문서는 모델 이름 등록 성공만 증명하며 GPT-4o 실호출 성공이나 분석 품질을 증명하지 않는다.
