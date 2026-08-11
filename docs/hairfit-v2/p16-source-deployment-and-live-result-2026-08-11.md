# P16 HairFit V2 소스 배포·실분석 실행 결과

- 실행일: 2026-08-11 KST
- 최종 운영 OFF 소스: `19b5d682088bbd71083ce273e8efc0b8a06b18c2`
- 원격 feature/develop: 위 SHA로 일치
- 대상 Worker: `hairstyleprivew`
- 판정: `live_local_analysis_pass / cloudflare_off_source_deploy_pass / public_canary_pending`

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

## Cloudflare 배포 결과

서버 rollout flag 25개를 모두 `false`로 재등록하고 `PROMPT_VISION_MODEL=gpt-4o`를 정확한 확인 토큰으로 재등록했다. 필수 서버 secret 이름은 값 조회 없이 `32/32`를 확인했다.

초기 단일 Worker 배포는 3 MiB 제한으로 거부됐지만, FaceMesh에 필요한 `tfjs-core`와 CPU backend만 유지하고 OpenNext 공식 멀티 워커 구조로 서버와 미들웨어를 분리했다. 최종 upload gzip은 server `3,049.89 KiB`, router `189.10 KiB`로 Free 한도 안에 들어왔다.

최종 server version은 `82eabfb8-3016-4216-9dd8-7e8e24f71d42`, router version은 `8221300d-eace-4332-9c69-4f22f43420d9`다. 라우터가 pin한 server ID와 `/.well-known/hairfit-deployment`의 source revision이 위 값과 SHA를 반환한다. root/login/www는 `200`, workspace는 로그인으로 `307`, 비인증 보호 API는 `401`을 확인했고 exact router/source/API 경계 probe는 5회 연속 통과했다.

MediaPipe/TensorFlow 서버 랜드마크 청크는 요구 기능이며 제거하거나 가짜 좌표로 대체하지 않았다. 플랜 업그레이드나 Docker 없이 배포했다. 서버 flag 25개는 OFF 상태를 유지했으며 공개 V2 canary는 시작하지 않았다.

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

- consulting contract: `78/78`
- HairFit V2 contract: `15/15`
- shared: `85/85`
- Web Playwright consulting: `20/20`
- Expo Jest: `41 suites`, `175/175`
- live analysis E2E: `1/1`
- workspace typecheck, Web lint, component registry, migration mirror, global CSS: 통과
- Supabase remote migration: `85/85`, 신규 HairFit advisor warning `0`

## 종료 판정

실인증·실분석·랜드마크 렌더링과 production OFF source deploy는 검증됐다. 0% staff canary version은 만들었지만 version override가 적용되지 않아 공개 비율을 올리지 않고 OFF로 복구했다. 공개 Web canary, 실제 유료 hair/Fashion generation, actual service/Aftercare live, Expo 실기기와 canary 관찰은 아직 닫히지 않았다. 상세 배포·롤백 증거는 `p19-cloudflare-off-deployment-result-2026-08-11.md`, `p20-staff-canary-attempt-and-off-recovery-2026-08-11.md`를 따른다.
