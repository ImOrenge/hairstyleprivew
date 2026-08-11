# P16 Cloudflare vision model 등록 준비

- 작성일: 2026-08-11 KST
- 상태: `registered`
- 원격 변경: 승인된 모델 이름 1개 등록 완료
- 대상 Worker: `hairstyleprivew`

## 고정 값

| 항목 | 값 |
|---|---|
| key | `PROMPT_VISION_MODEL` |
| model | `gpt-4o` |
| payload key 수 | 1 |
| provider | OpenAI Responses API |
| 필수 credential 이름 | `OPENAI_API_KEY` |
| 확인 토큰 | `HAIRFIT_V2_PROMPT_VISION_MODEL_GPT_4O` |

사용자가 지정한 `gpt-4o`는 OpenAI 공식 모델 목록의 GPT-4o 계열이며 text·image 입력을 지원한다. Responses API의 image input과 JSON schema structured output을 사용한다. <https://platform.openai.com/docs/models/gpt-4o>

기존 얼굴 분석 실행기는 Gemini SDK에 고정돼 있었으므로 모델 이름만 교체하지 않았다. `PROMPT_VISION_MODEL`을 실행 모델의 최우선 권위 값으로 만들고, `gpt-*`/`o*` 모델은 OpenAI Responses API, Gemini 모델은 기존 Google 경로로 분기한다. Capability provenance의 provider와 model도 실제 실행 경로와 일치한다. `.env.local.example`은 `gpt-4o`로 정렬했다.

## 실행기 안전 계약

`scripts/set-hairfit-v2-cloudflare-model.mjs`는 다음을 강제한다.

- exact Worker가 아니면 거부
- `--apply`와 exact confirmation token이 함께 없으면 거부
- payload는 `PROMPT_VISION_MODEL=gpt-4o` 한 항목만 허용
- `OPENAI_API_KEY`, `GOOGLE_API_KEY`, rollout flag, `NEXT_PUBLIC_`, paid-confirmation key 제외
- 임시 secret 파일 없이 Wrangler bulk stdin 사용
- 적용 후 secret 이름을 다시 조회해 1/1이 아니면 실패
- 다른 secret 값은 읽거나 출력하지 않음

등록 실행기 contract 3/3, provider 분기·실행 경로 contract 4/4, 전체 상담 contract 73/73, TypeScript와 ESLint, Next production build 130 pages가 통과했다. 등록 전 원격 secret-name read-only 결과는 `31/32`, 누락은 `PROMPT_VISION_MODEL` 하나였다. 승인 적용 후 `32/32 READY`가 됐으며 값은 읽지 않았다. 적용 결과는 `p16-cloudflare-model-registration-result-2026-08-11.md`를 따른다.

## 승인 후 명령

```powershell
npm run hairfit-v2:cloudflare:model
npm run hairfit-v2:cloudflare:model -- --apply --confirm=HAIRFIT_V2_PROMPT_VISION_MODEL_GPT_4O
```

적용 후 required server secret names가 `32/32`인지 확인하고 공개 `/`, `/workspace`, `/consulting/new` 동작과 Supabase 85 migration이 변하지 않았는지 확인한다.

## 승인 경계와 rollback

다음 정확한 승인으로 적용했다.

`P16 PROMPT_VISION_MODEL=gpt-4o 원격 등록 승인`

이 승인은 모델 이름 한 항목 등록만 포함했다. rollout flag ON, `NEXT_PUBLIC_` 변경, source deployment, provider API 호출, 실인증·실사진·canary는 포함하지 않았고 실행하지 않았다.

등록 후 문제가 있으면 rollout flag는 계속 OFF이므로 신규 HairFit V2 provider 경로가 열리지 않는다. 모델 변경·secret 삭제는 별도 승인된 rollback으로만 수행한다.
