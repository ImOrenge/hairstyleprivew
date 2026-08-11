# P16 HairFit V2 소스 배포·실분석 실행 결과

- 실행일: 2026-08-11 KST
- 최종 검증 소스: `1d66bd73665510793950cba405ccdb95544d8349`
- 원격 feature/develop: 위 SHA로 일치
- 대상 Worker: `hairstyleprivew`
- 판정: `live_local_canary_pass / cloudflare_source_deploy_blocked / production_unchanged`

## 승인 적용 범위

일괄 승인에 따라 feature push, `develop/2026-08-08-hairfit-v2-backend` ff-only 통합·push, Cloudflare OFF source deploy, canary, 실인증·실분석, 최종 증빙 작성을 진행했다. 버전 변경, tag, main 반영, 브랜치·worktree 삭제와 요금제 구매는 승인 범위에 포함하지 않았다.

## Git 고정

| 항목 | 결과 |
|---|---|
| 최초 통합 구현 | `22394d226faf2098ecc3689f737be3de55c1497c` |
| Worker 크기 최적화 | `44733f21afae035c88629449d48ea052bd63d18b` |
| 인터뷰·실분석 계약 수정 | `1d66bd73665510793950cba405ccdb95544d8349` |
| 원격 feature | 최종 검증 소스와 일치 |
| 원격 develop | 최종 검증 소스와 일치 |
| 통합 방식 | 두 차례 모두 `git merge --ff-only` |
| main | 변경하지 않음 |

## Cloudflare 배포 시도

서버 rollout flag 25개를 모두 `false`로 재등록하고 `PROMPT_VISION_MODEL=gpt-4o`를 정확한 확인 토큰으로 재등록했다. 필수 서버 secret 이름은 값 조회 없이 `32/32`를 확인했다.

`22394d2` OFF bundle은 Next.js 130 routes와 OpenNext bundle을 만들었으나 Cloudflare API가 Worker 압축 크기 3 MiB 제한으로 신규 version을 거부했다. 운영 Worker version은 교체되지 않았다.

아이콘을 1024px/178,916 bytes에서 동일 로고의 512px/19,689 bytes로 최적화한 `44733f2`에서 server handler gzip은 `3,119,769 bytes`로 내려갔다. 그러나 Wrangler가 middleware 등 전체 모듈을 합산한 업로드는 `3,406.17 KiB`였고 다시 `code 10027`로 거부됐다. 따라서 OFF smoke와 원격 canary는 시작되지 않았고 공개 서비스는 기존 version을 유지한다.

MediaPipe/TensorFlow 서버 랜드마크 청크는 요구 기능이며 제거하거나 가짜 좌표로 대체하지 않았다. Cloudflare 유료 Worker 한도 상향은 비용 발생 외부 결정이므로 자동 수행하지 않았다.

## 실인증·실분석 결과

production deploy와 분리해 로컬 Web canary를 모든 V2 flag ON, legacy entitlement bridge OFF, `PROMPT_VISION_MODEL=gpt-4o`로 실행했다. Clerk 기존 개발 고객을 사용했고 이메일·user ID·원본 Storage path는 기록하지 않았다. 사진은 저장소의 승인된 데모 얼굴 fixture를 사용했으며 실제 사용자 사진 검증으로 확대 해석하지 않는다.

첫 실행에서 인터뷰 UI와 live E2E가 구 폼 계약으로 어긋난 사실을 확인했다. 갱신 후 다음 두 구현 결함을 실제 원격 저장에서 발견하고 수정했다.

1. 서버 guard가 주제별 Discovery autosave에도 전체 완료 조건을 강제해 첫 답변을 거부했다. 전체 필수값·시술 충돌 검사는 `completeStage: "discovery"`에서만 수행하도록 변경했다.
2. autosave 성공 뒤 공통 mutation hook이 `recommendedStage`로 즉시 이동해 인터뷰 후반 주제를 건너뛰었다. 중간 저장은 `{ navigate: false }`, 최종 확인만 Photo 이동으로 고정했다.

최종 live E2E는 58.3초에 통과했다.

- Clerk 실제 개발 인증
- 새 consultation 생성
- Discovery 7개 주제 autosave와 최종 1회 Photo 전환
- 정면 fixture 선택, 시스템 사전검사와 4:5 프레이밍
- private draft 업로드 `201`
- 비동기 분석 접수 `202`와 Scan 대기 연출
- MediaPipeFaceMesh landmark/contour/measurement 생성
- `gpt-4o` 얼굴 분석 실행
- 원격 Supabase `analysis_ready`, source photo와 evidence 연결
- Analysis 자동 handoff
- Scan 재진입 즉시 signed asset 자동 로드
- 얼굴 overlay와 5개 이상 landmark 렌더링

결제 승인, 유료 생성 확인, 사용량 차감과 3×3/Fashion 실제 유료 생성은 이 검증에서 실행하지 않았다.

## 검증 요약

- consulting contract: `73/73`
- HairFit V2 contract: `15/15`
- shared: `85/85`
- Web Playwright consulting: `20/20`
- Expo Jest: `41 suites`, `175/175`
- live analysis E2E: `1/1`
- workspace typecheck, Web lint, component registry, migration mirror, global CSS: 통과
- Supabase remote migration: `85/85`, 신규 HairFit advisor warning `0`

## 종료 판정

실인증·실분석·랜드마크 렌더링은 검증됐다. 하지만 production source deploy가 계정 3 MiB 한도에서 거부됐으므로 P16 전체는 완료가 아니다. 운영 canary, 실제 유료 hair/Fashion generation, actual service/Aftercare live, Expo 실기기와 rollback 관찰은 production source가 배포되기 전까지 닫을 수 없다.

