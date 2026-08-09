# HairFit V2 프론트엔드·백엔드 리팩터링 보완 실행 문서

- 작성일: 2026-08-09
- 작업 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 제품 정의: 기존 생성 마법사가 아니라, 사진 근거와 사용자 선택을 연결하는 **AI 헤어스타일 컨설턴트 서비스**
- 시각 계약: 기존 CSS, 토큰, 타이포그래피, 간격, 표면 스타일을 그대로 유지한다.

## 1. 문서 권한과 범위

페이지 구조와 화면 역할은 `HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx`의 11개 Scene을 따른다. 백엔드 V2 패키지는 세션, 분석 근거, 전략, 생성, 프리뷰 보드의 영속성과 권한 계약을 제공한다. 두 문서가 충돌할 때 화면 구조와 사용자 여정은 프론트 문서, 데이터 무결성과 보안은 백엔드 계약을 우선한다.

이번 작업은 11개 URL과 헤더리스 Scene을 유지하며 기존 CSS 파일을 변경하지 않는다. 레거시 마법사는 기능 플래그 롤백 및 기존 생성 엔진과의 호환 브리지일 뿐, 새 상담 여정에 노출되는 기본 UI가 아니다.

## 2. 확인된 현재 상태

### 완료된 기반

- `/consulting/[sessionId]/*` 11개 Scene과 서버 소유 snapshot, optimistic concurrency가 구현되어 있다.
- 사진 업로드 뒤 브라우저 사전검사와 서버 Sharp 사전검사를 거쳐 적격 사진만 AI 분석으로 전달한다.
- AI 분석 결과는 `analysis_evidence_v2`에 버전 근거로 저장하며 재분석 시 식별자/FK 충돌을 피한다.
- 전략 확정 뒤 기존 유료 생성 접수와 V2 3×3 프리뷰 보드를 연결하는 브리지가 있다.
- 원격 Supabase의 필수 V2 테이블, RLS/권한, 비공개 생성 결과 버킷이 확인되었다.

### 수정이 필요한 결함

| 우선순위 | 영역 | 확인된 문제 | 완료 기준 |
|---|---|---|---|
| P0 | 상태 계약 | 사진 단계 guard가 아직 생성 전인데 `generationId`를 요구한다. 생성은 Scene 06에서만 시작하므로 사진 분석 후 Scene 03으로 갈 수 없다. | 업로드·사용 범위·8개 시스템 검사·AI 근거가 있으면 `photo → scan` 전환, 생성 ID는 Scene 06에서 연결 |
| P0 | 프리뷰 | 9개 전부가 준비되어야 shortlist를 저장할 수 있다. 문서는 품질 통과 후보가 2~3개 준비되면 부분 의사결정을 허용한다. | accepted 후보 2~3개면 비교로 진행하고 나머지 생성 상태는 계속 표시 |
| P1 | 사용자 입력 | 목적, 구조화한 현재 모발, 허용 시술, 열기구 빈도, 변화 강도가 계약·프롬프트에 충분히 반영되지 않는다. | Scene 01 입력이 서버 snapshot과 전략/생성 프롬프트의 명시적 제약으로 이어짐 |
| P1 | 분석 근거 UX | Scan/Analysis/Direction이 근거 ID와 추천·영향·trade-off를 충분히 연결하지 않는다. | 선택 근거를 추적할 수 있고 사용자가 추천을 수정해 확정 가능 |
| P0 | 얼굴 좌표 근거 | `analysis_evidence_v2`의 contour/hairline/measurement가 비어 있고 사진 UI는 `<img>`만 표시한다. | 서버 landmark 모델의 정규화 좌표를 저장하고 Scan/Analysis 사진 위 SVG가 같은 Evidence ID를 렌더링 |
| P1 | 접근성 | Scene URL 전환 뒤 주 제목으로 프로그램 포커스가 이동하지 않는다. | Scene 변경/직접 진입 후 `h1` 포커스 및 기존 오버레이 포커스 계약 유지 |
| P2 | 후속 Scene | Aftercare 사진은 임의 URL 입력이고 Fashion은 정적 placeholder 중심이다. | 실제 업로드와 같은 선택 snapshot을 쓰는 생성 흐름으로 교체 — 구현 완료, 원격 migration/auth smoke 대기 |
| P2 | 플랫폼 | Expo 상담 화면과 전체 인증 E2E 증거가 없다. | shared/API client 기반 재개·분석·overlay·board·결정 구현 완료, 실제 기기·인증·구매 복원 검증 대기 |

## 3. 목표 데이터 흐름

1. Scene 01에서 상담 목적, 현재 모발, 허용/회피 시술, 관리 시간, 열기구 빈도, 변화 강도를 저장한다.
2. Scene 02에서 사진을 비공개 draft로 업로드하고 시스템 사전검사를 먼저 수행한다. 차단 조건을 통과한 사진만 서버 FaceMesh가 얼굴 landmark를 추출하고 생성형 AI가 얼굴·모발 근거를 설명한다.
3. 서버가 저장한 normalized landmark·contour·inferred hairline·measurement Evidence ID를 Scene 03~05의 사진 레이어, 의미, 추천, 사용자 수정에 연결하고 versioned strategy를 확정한다. 브라우저는 좌표를 재추론하지 않는다.
4. Scene 06에서만 결제/처리량을 확인하고 이미지 생성을 접수한다. 생성 프롬프트에는 Scene 01 사용자 옵션과 Scene 05 확정 전략을 함께 넣는다.
5. 품질 통과 프리뷰가 최소 2개 생기면 shortlist·비교를 허용한다. 최종 선택, 살롱 브리프, 실제 시술, 애프터케어, 패션은 같은 revision snapshot을 사용한다.
6. 애프터케어 사진은 임의 URL이 아니라 private Storage 업로드로 실제 시술 record에 연결한다. 패션은 확정 헤어 snapshot을 원본으로 삼은 실제 Styler 생성 세션만 비교·확정한다.
7. Expo는 SecureStore의 활성 상담 ID로 동일 V2 세션을 재개하고, 업로드→서버 분석→생성 접수→native evidence overlay→3×3 shortlist→확정을 shared API client로 수행한다.

## 4. 실행 순서

- [x] 기존 프론트·백엔드 구현과 원격 읽기 전용 상태를 취합한다.
- [x] 통합 범위, 우선순위, 종료조건, 롤백을 이 문서에 고정한다.
- [x] P0 사진 완료 guard의 생성 ID 순환 의존을 제거하고 계약 테스트를 추가한다.
- [x] P0 부분 프리뷰 shortlist를 허용하고 interaction/contract 테스트를 추가한다.
- [x] P1 Scene 제목 포커스를 복구하고 브라우저 E2E에 포함한다.
- [x] P1 구조화 사용자 입력을 shared contract, snapshot 정규화, UI, 전략/생성 프롬프트까지 연결한다.
- [x] P1 근거→추천→사용자 수정→전략 확정 연결을 강화한다.
- [x] P0 서버 FaceMesh landmark→normalized geometry→V2 저장→SVG overlay를 연결하고 클라이언트 좌표 주입 경로를 제거한다.
- [x] P2 Aftercare 실제 사진을 private Storage와 `actual_services_v2`에 연결한다.
- [x] P2 Fashion 정적 placeholder를 제거하고 확정 snapshot 기반 실제 추천·견적·생성·2~3개 비교 흐름으로 교체한다.
- [x] P2 Expo 상담 home/resume, 서버 사진 분석, native normalized overlay, 3×3 shortlist/선택/확정/brief core parity를 shared API client로 연결한다.
- [ ] Expo 실제 기기, 인증 계정, background/resume, deep link/push, Google Play 복원과 Fashion/Aftercare 전체 native smoke를 수행한다.
- [x] 로컬 구현 전체를 대상으로 마지막 종합 검증을 수행한다.

## 5. 검증과 종료조건

골은 아래 조건이 모두 충족되기 전에는 완료하지 않는다.

- [x] 기존 CSS 파일과 공개 CSS 클래스/토큰 계약에 의도하지 않은 변경이 없다.
- [x] 11개 Scene URL과 헤더리스 구조가 유지되고, 레거시 마법사가 기본 상담 여정에 노출되지 않는다.
- [ ] 실제 사진 업로드가 시스템 검사→AI 분석→근거 저장→Scan 전환으로 이어진다.
- [x] renderer가 저장된 detected/inferred 좌표와 같은 Evidence ID를 사진 위에 표시하며, 키보드로 측정선을 선택할 수 있다.
- [x] 사용자 입력과 확정 전략이 생성 요청/프롬프트에 반영된다.
- [x] 품질 통과 후보 2~3개로 shortlist, 비교, 최종 결정을 진행할 수 있다.
- [x] 최신 전체 변경 기준 `typecheck`, `lint`, 상담/V2/Expo 계약 테스트, component/CSS 계약, production build가 통과한다.
- [x] 최신 전체 변경 기준 브라우저 E2E에서 11개 Scene, 직접 URL, 포커스, 모바일 overflow/a11y, 부분 생성, 저장 landmark overlay, Fashion 실제 API 연결 UI를 검증한다.
- [ ] 로그인된 실제 계정으로 사진 업로드·Aftercare 업로드·Fashion 생성까지 브라우저 smoke를 수행한다.
- [x] 원격 Supabase는 읽기 전용으로 세션·분석 근거·생성 연결 상태와 RLS를 재확인한다.
- [x] Docker 등 환경 제한이나 실제 인증 smoke 미실행 항목은 통과로 위장하지 않고 남은 위험으로 기록한다.

## 6. 배포와 롤백

- 구현은 기능 브랜치에서 검증하고, 별도 승인 전에는 병합·푸시·배포하지 않는다.
- `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=false`가 화면 롤백 경로다.
- Expo는 `EXPO_PUBLIC_MOBILE_V2_ENABLED=false`에서 `/consulting` 진입을 기존 `/upload`로 되돌린다.
- `FACE_TRUST_OVERLAY_V2_ENABLED=false`는 저장된 근거를 삭제하지 않고 SVG 신뢰 UI만 숨기는 롤백 경로다.
- 롤백은 기존 상담 snapshot, 분석 근거, 생성 결과를 삭제하지 않는다.
- DB 계약 변경이 필요하면 additive migration만 사용하고 원격 적용 전 mirror/fresh/권한 검증과 별도 승인을 거친다.

## 7. 재사용 가능한 골 프롬프트

```text
새 개발 브랜치에서 HairFit V2를 문서 정의의 비마법사형 AI 헤어스타일 컨설턴트 서비스로 완성한다.

먼저 프론트엔드·백엔드의 구현·검증 결과와 미완료 항목을 하나의 실행 문서에 통합한다. 기존 CSS 스타일은 변경하지 않고 프론트 문서의 11개 헤더리스 Scene 구조를 유지한다. 사진 업로드→시스템 사전검사→AI 이미지 분석→근거 저장→스캔/분석/방향 결정→사용자 옵션과 확정 전략이 반영된 이미지 생성→품질 통과 후보 shortlist/비교/결정 흐름을 실제 서버 상태로 연결한다. 레거시 생성 마법사는 기본 여정에서 제거하고 기능 플래그 롤백 및 호환 브리지로만 유지한다.

수정 우선순위는 사용자 흐름을 막는 상태 계약, 부분 생성 의사결정, 구조화 사용자 입력과 프롬프트 반영, 분석 근거 추적, 접근성, Aftercare/Fashion/Expo 순이다. 이미 구현된 기능과 계획만 있는 기능을 구분하며, 검증은 모든 수정이 끝난 마지막 단계에서 타입·린트·계약·빌드·브라우저 E2E·읽기 전용 원격 Supabase 증거를 한 번에 수행한다. 문서의 종료조건을 모두 만족하고 남은 환경 제한을 정직하게 기록한 경우에만 골을 완료한다. 병합·푸시·배포는 별도 승인 없이는 수행하지 않는다.
```

## 8. 구현 상태

현재 상태는 **진행 중**이다.

2026-08-09 구현·검증 결과:

- 사진 단계는 private draft, 8개 시스템 검사, AI 근거, Evidence ID가 있으면 생성 ID 없이 Scan으로 이동한다. 근거 `reviewed` 조건은 Scan 완료 시점으로 옮겼다.
- Scene 01의 목적·모발 구조·시술 범위·관리 시간·열기구·변화 강도가 V2 preferences와 `PromptInputV2`에 연결된다.
- 사진 AI 분석에서 Evidence ID가 붙은 8축 추천을 만들고 Direction에서 추천·현재 선택·영향·trade-off를 함께 표시한다.
- 시스템 사전검사 뒤 서버 TensorFlow.js MediaPipe FaceMesh가 478개 keypoint를 추출한다. 핵심 landmark 13개, 실제 face contour, inferred hairline, 정규화 측정선을 `analysis_evidence_v2`에 저장하며 브라우저는 저장값만 SVG로 렌더링한다.
- 사진 단계 완료 guard는 같은 상담의 persisted landmark 5개 이상, contour 1개 이상, measurement 4개 이상을 서버에서 다시 확인한다. 고객용 V2 분석 API가 임의 `AnalysisEvidenceV2`를 직접 저장하던 경로는 draft 기반 서버 분석으로 교체했다.
- 품질 통과 결과 2~3개로 shortlist할 수 있으며, V2 shortlist/selection/confirm, salon brief, aftercare dual-write를 연결했다.
- additive mirror migration `202608090001_hairfit_v2_partial_preview_decision.sql`, `202608090002_hairfit_v2_analysis_landmarks.sql`, `202608090003_hairfit_v2_aftercare_fashion_bridge.sql`은 생성했지만 원격에는 적용하지 않았다. 읽기 전용 조회에서 `20260809%` migration version은 없고 landmark/measurement, Aftercare private-photo, Fashion source bridge 컬럼·함수도 모두 없는 상태다.
- 원격 최신 상담은 `row_version=3`, `snapshot_version=3`, `lifecycle_state=draft`, `current_stage=photo`, 분석 근거 있음, source generation/preview board 없음이다.
- 원격 V2 필수 테이블 17/17은 RLS enabled+forced이며 anon/authenticated SELECT가 모두 회수되어 있다. transition/selection RPC는 service role만 실행 가능하다.
- landmark 구현 체크포인트 통과: 공식 portrait fixture에서 얼굴 1명·478 keypoint, 410×512 원본 좌표계, 핵심 landmark 13개·37점 contour·측정선 13개를 추출했다. 최신 전체 회귀에서 `typecheck` 전 workspace, lint 0 error(기존 Expo `Array<T>` warning 1개), HairFit V2 13/13, 상담/landmark 16/16, styling 7/7, paid-action 20/20, CSS 9/9, component registry 51/51, Expo 41 suite·170 test가 통과했다. Next production build는 129 routes, Expo Web/Android/iOS bundle, Playwright는 7/7을 통과했다. overlay는 원본 가로·세로 비율과 사진의 `object-cover` 변환을 동일하게 적용하고, 키보드 포커스 시 SVG 기본 아웃라인이 사진을 덮지 않도록 활성 측정선 자체를 포커스 표시로 사용한다. CSS 파일은 변경하지 않았다.
- Aftercare는 시술 record를 먼저 확정한 뒤 동의한 파일만 Sharp 정규화·SHA-256 fingerprint와 함께 비공개 `aftercare-photos` 버킷에 저장한다. 고객 snapshot에는 URL 대신 service ID·fingerprint·업로드 시각만 남기고 계정 삭제 outbox에도 포함한다.
- Fashion Scene 11은 정적 `LOOKS`와 구 Styler 마법사 링크를 제거했다. 확정 V2 snapshot을 레거시 generated variant에 검증 가능한 방식으로 매핑하고, 6개 상황의 추천→최신 유료 견적→실제 AI 생성→완료된 세션 2~3개 shortlist→최종 룩 확정을 한 Scene에서 처리한다. 다른 상담·다른 snapshot·미완료 세션 ID는 서버가 거부한다.
- Expo는 `/consulting`을 기본 상담 진입점으로 사용한다. 활성 V2 상담 ID를 SecureStore에 보존하고, 같은 `consultationId`로 업로드·서버 사전검사·FaceMesh/AI 분석·유료 생성 접수를 연결한다. 서버 normalized landmark/contour를 native overlay로 표시하고 3×3 board, persisted shortlist, 선택·확정, salon brief까지 재개한다.
- 미완료: migration 3개 원격 적용, 로그인된 실제 사진 재업로드→FaceMesh→AI 분석→부분 생성→선택→Aftercare/Fashion smoke, `SALON_BRIEF_V2_ENABLED`·`STYLING_LINK_V2_ENABLED` 단계적 활성화, Expo 실제 기기/background/deep link/push/구매 복원 및 Fashion/Aftercare 전체 native smoke다. 따라서 로컬 구현과 종합 회귀는 끝났지만 골의 전체 종료조건은 완료 처리하지 않는다.
