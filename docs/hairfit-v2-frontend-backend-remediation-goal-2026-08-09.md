# HairFit V2 프론트엔드·백엔드 리팩터링 보완 실행 문서

- 작성일: 2026-08-09
- 작업 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 제품 정의: 기존 생성 마법사가 아니라, 사진 근거와 사용자 선택을 연결하는 **AI 헤어스타일 컨설턴트 서비스**
- 시각 계약: 기존 CSS, 토큰, 타이포그래피, 간격, 표면 스타일을 그대로 유지한다.

## 1. 문서 권한과 범위

페이지 구조와 화면 역할은 `HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx`의 11개 Scene을 따른다. 백엔드 V2 패키지는 세션, 분석 근거, 전략, 생성, 프리뷰 보드의 영속성과 권한 계약을 제공한다. 두 문서가 충돌할 때 화면 구조와 사용자 여정은 프론트 문서, 데이터 무결성과 보안은 백엔드 계약을 우선한다.

이번 작업은 11개 URL과 헤더리스 Scene을 유지하며 기존 CSS 파일을 변경하지 않는다. 레거시 마법사는 기능 플래그 롤백 및 기존 생성 엔진과의 호환 브리지일 뿐, 새 상담 여정에 노출되는 기본 UI가 아니다.

## 2. 구현·검증 취합

### 로컬 구현에서 닫힌 항목

- `/consulting/[sessionId]/[stage]`는 문서의 11개 고유 URL과 헤더리스 Scene을 유지한다. 상담 시작 CTA는 새 AI 컨설턴트로 직접 연결되고 구 마법사는 기본 경로가 아니다.
- Scene 01의 목적, 현재 모발 구조, 허용 시술, 관리 시간, 열기구 빈도, 변화 강도, 회피 조건은 서버 snapshot과 V2 preferences, 전략 및 생성 prompt input으로 이어진다.
- Scene 02는 브라우저 검사 후 private draft를 업로드하고 서버 Sharp 검사, 서버 FaceMesh 좌표 추출, 생성형 AI 설명 순으로 처리한다. 생성 ID 없이 분석을 끝내 Scene 03으로 이동하고 유료 생성은 Scene 06에서만 시작한다.
- `analysis_evidence_v2`는 landmark, detected contour, inferred hairline, measurements, skin sample, excluded region을 원본 사진 좌표계의 정규화 좌표로 보존한다. Web/Expo는 이 서버 값을 사진 위에 렌더링하며 클라이언트가 얼굴 좌표를 추론하지 않는다.
- 사용자 좌표 보정은 AI 원본을 덮어쓰지 않는다. `correction_revision`과 append-only `manual_corrections`를 사용하는 service-role RPC로 원본점과 보정점을 함께 남긴다.
- Scene 03~05는 사진 overlay, Evidence Ledger, Focus Ribbon, Direction Matrix가 같은 Evidence ID를 공유하고 추천·현재 선택·영향·trade-off를 함께 표시한다.
- Scene 06은 BALANCE/IMAGE/LIFESTYLE 3×3 실제 생성 보드를 사용하며 품질 통과 결과가 2~3개가 되는 즉시 shortlist/compare를 허용한다.
- Salon Brief는 사용자가 수정한 audience, summary, cut, volume, color, styling, cautions를 V2 버전 문서로 저장한다. 공유 토큰의 만료/취소 및 원본 얼굴 비포함 원칙은 기존 서버 흐름을 유지한다.
- Aftercare는 실제 시술 record를 먼저 잠그고 오늘 행동, 체크포인트 완료 상태, concern, satisfaction을 V2 version patch로 저장한다. 동의한 after photo만 private Storage에 연결한다.
- Fashion은 `DAILY 3 + WORK 3 + STATEMENT 3 = 9` 고정 슬롯과 상황·장르·계절·핏·노출·예산·회피 조건을 서버 생성에 전달하며 완료 결과 2~3개 비교와 최종 metadata history를 저장한다.
- Expo는 같은 shared contract/API client로 서버 evidence overlay와 좌표 보정, 상담 재개, 3×3 결정 핵심 흐름을 사용한다.

### 종료를 막는 외부 상태

| 영역 | 현재 증거 | 종료 전 필요한 증거 |
|---|---|---|
| 원격 DB | `hair-fit-seoul`에 migration `202608090001`~`004` 적용 및 이력·함수 권한·RLS·column·constraint·private bucket smoke 완료 | 충족 |
| 실제 인증 브라우저 | 기존 Clerk 개발 고객으로 실제 사진 업로드→사전검사→FaceMesh→AI 분석→원격 근거 저장→Scan overlay→전략 확정→10-credit 생성 접수와 품질 통과 8/9까지 확인 | 사용자가 후속 실인증을 패스했으므로 실제 계정 decision→Aftercare/Fashion은 미검증으로 유지 |
| 실제 모바일 | Expo 55 권장 `react-native@0.83.10` 정합화, Jest·Web/iOS/Android bundle 완료. SM-S936N Android 16/API 36 연결과 설치 앱/Expo Go 상태까지만 확인 | 현재 소스 development build 설치, background/resume, deep link/push, 구매 복원, Aftercare/Fashion native smoke |
| 라이브 AI/결제 | 승인된 첫 접수는 백엔드 결함으로 전체 실패했으나 예약 10 전액 자동 환원. 수정 후 두 번째 접수는 10-credit 영수증 committed, 8개 생성·품질 통과와 한 슬롯 3회 `style_mismatch` 거절 확인 | 추가 차감이나 실인증 후속 여정은 사용자 지시에 따라 수행하지 않음 |

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
- [x] Aftercare의 사용자 관리 입력을 V2 초기 program과 versioned patch에 연결하고 실제 시술 필드는 최초 확정 뒤 잠근다.
- [x] Salon Brief의 사용자 편집값을 V2 버전 payload에 연결한다.
- [x] P2 Fashion 정적 placeholder를 제거하고 구조화 방향, 정확히 9개 슬롯, 확정 snapshot 기반 실제 추천·견적·생성·2~3개 비교 흐름으로 교체한다.
- [x] P2 Expo 상담 home/resume, 서버 사진 분석, native normalized overlay, 3×3 shortlist/선택/확정/brief core parity를 shared API client로 연결한다.
- [x] AI 원본 좌표를 보존하는 Web/Expo landmark 보정과 service-role revision RPC를 추가한다.
- [x] 원격에 선행 적용된 `20260808090000` 계보(`ca8afd9`)를 수동 통합하고 사용자 모발 옵션과 동일 상담 ID가 Web·Expo 생성 요청에 함께 유지되도록 충돌을 해소한다.
- [x] 기존 Clerk 개발 고객을 PII 없이 자동 발견하는 별도 live E2E로 실제 업로드·서버 사전검사·FaceMesh·AI 분석·원격 evidence·Scan overlay를 같은 상담에서 검증한다.
- [x] 같은 상담을 Scan→Analysis→Direction→Previews까지 진행해 유료 생성 견적만 조회하고 `/api/generations/accept` 미호출, `source_generation_id` 미생성, 잔액 불변을 검증한다.
- [x] 승인된 실생성에서 로컬 Workflow 우선순위, PostgREST FK 관계명, V2 attempt 재진입 결함을 발견·수정하고 새 접수의 committed 10-credit 영수증과 품질 통과 8/9를 확인한다.
- [x] Expo 55 권장 React Native patch를 `0.83.10`으로 맞추고 dependency check, Jest, Web/iOS/Android bundle을 재검증한다.
- [ ] Expo 실제 기기, 인증 계정, background/resume, deep link/push, Google Play 복원과 Fashion/Aftercare 전체 native smoke를 수행한다.
- [x] 모든 코드·문서 수정이 끝난 뒤에만 최종 종합 검증을 다시 수행한다.

## 5. 검증과 종료조건

골은 아래 조건이 모두 충족되기 전에는 완료하지 않는다.

- [x] 기존 CSS 파일과 공개 CSS 클래스/토큰 계약에 의도하지 않은 변경이 없다.
- [x] 11개 Scene URL과 헤더리스 구조가 유지되고, 레거시 마법사가 기본 상담 여정에 노출되지 않는다.
- [x] 로그인된 실제 계정의 실제 사진 업로드가 시스템 검사→FaceMesh→생성형 AI 분석→근거 저장→Scan 전환으로 이어진다. 로컬 코드/fixture 증거만으로는 이 항목을 완료하지 않는다.
- [x] renderer가 저장된 detected/inferred 좌표와 같은 Evidence ID를 사진 위에 표시하며, 키보드로 측정선을 선택하고 원본 보존형 좌표 보정을 적용할 수 있다.
- [x] 사용자 입력과 확정 전략이 생성 요청/프롬프트에 반영된다.
- [x] 품질 통과 후보 2~3개로 shortlist, 비교, 최종 결정을 진행할 수 있다.
- [x] 최신 전체 변경 기준 `typecheck`, `lint`, 상담/V2/Expo 계약 테스트, migration mirror/fresh, component/CSS 계약, production build가 통과한다.
- [x] 최신 전체 변경 기준 브라우저 E2E에서 11개 Scene, 직접 URL, 포커스, 모바일 overflow/a11y, 부분 생성, 저장 landmark overlay/보정, Fashion 9-slot 실제 API 연결 UI를 검증한다.
- [ ] 로그인된 실제 계정으로 decision·Aftercare 업로드·Fashion 생성까지 브라우저 smoke를 수행한다. 2026-08-09 사용자 지시로 추가 실인증은 패스했다.
- [x] 승인된 원격 Supabase migration을 적용하고 이력, RLS, 필수 객체와 함수 권한을 다시 확인해 기록한다.
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
새 개발 브랜치에서 HairFit V2를 문서 정의의 비마법사형 AI 헤어스타일 컨설턴트 서비스로 완성한다. 페이지 구조는 HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx의 11개 Scene을 권위로 사용한다.

먼저 프론트엔드·백엔드의 구현·검증 결과와 미완료 항목을 하나의 실행 문서에 통합한다. 기존 CSS 파일, 토큰, 타이포그래피, 간격, 표면 스타일은 변경하지 않고 11개 헤더리스 Scene과 `01 / 11 + 큰 작업명` 구조를 유지한다. 고정 헤더, 오른쪽 consultant panel, 단계별 Next 중심 마법사 UI를 만들지 않는다. 레거시 생성 마법사는 기본 여정에서 제거하고 기능 플래그 롤백 및 호환 브리지로만 유지한다.

사진 업로드→시스템 사전검사→서버 FaceMesh→생성형 AI 이미지 분석→버전 근거 저장→사진 위 landmark/contour/hairline/measurement/skin/excluded overlay→스캔/분석/방향 결정→사용자 옵션과 확정 전략이 반영된 3×3 이미지 생성→품질 통과 후보 2~3개 shortlist/비교/결정→구조화 Salon Brief→실제 시술 기반 Aftercare→구조화 방향이 반영된 DAILY 3 + WORK 3 + STATEMENT 3 Fashion 흐름을 실제 서버 상태로 연결한다. 사용자 좌표 보정은 AI 원본을 덮어쓰지 않고 revision audit로 저장한다. Web과 Expo는 같은 shared contract와 server truth를 사용한다.

수정 우선순위는 사용자 흐름을 막는 상태 계약, 사진/분석/생성 연결, 사용자 옵션과 프롬프트 반영, 분석 근거 추적, 부분 생성 의사결정, 접근성, Salon Brief/Aftercare/Fashion/Expo 순이다. 이미 구현된 기능과 계획만 있는 기능을 구분한다. 원격 migration, 병합, 푸시, 배포는 별도 승인이 없으면 수행하지 않는다. 검증은 모든 수정이 끝난 마지막 단계에서만 타입·린트·계약·migration mirror/fresh·component/CSS 계약·production build·브라우저 E2E·Expo 및 읽기 전용 원격 Supabase 증거를 종합한다. 실제 인증, 라이브 AI/결제, 실제 기기처럼 실행하지 못한 항목을 통과로 위장하지 않는다. 모든 종료조건이 충족된 경우에만 골을 완료한다.
```

## 8. 구현 상태

현재 상태는 **로컬 구현·`20260808090000` 계보 통합·원격 migration·종합 회귀·실제 Clerk 기반 사진 분석·무차감 견적·승인된 10-credit 생성과 부분 품질 결과 8/9까지 완료, 사용자 요청으로 후속 실인증을 패스하고 실제 decision·Aftercare/Fashion·실기기 검증은 대기**다.

2026-08-09 구현·검증 결과:

- 사진 단계는 private draft, 8개 시스템 검사, AI 근거, Evidence ID가 있으면 생성 ID 없이 Scan으로 이동한다. 근거 `reviewed` 조건은 Scan 완료 시점으로 옮겼다.
- Scene 01의 목적·모발 구조·시술 범위·관리 시간·열기구·변화 강도가 V2 preferences와 `PromptInputV2`에 연결된다.
- `PromptInputV2` 조립을 순수 모듈로 분리하고 실제 상담 목적·현재 모발·확정 길이·허용 시술·관리 시간·열기구·방문 주기·회피 조건이 9개 보호 provider prompt에 모두 포함되는 계약 테스트를 추가했다.
- 사진 AI 분석에서 Evidence ID가 붙은 8축 추천을 만들고 Direction에서 추천·현재 선택·영향·trade-off를 함께 표시한다.
- 시스템 사전검사 뒤 서버 TensorFlow.js MediaPipe FaceMesh가 478개 keypoint를 추출한다. 핵심 landmark 13개, 실제 face contour, inferred hairline, 정규화 측정선을 `analysis_evidence_v2`에 저장하며 브라우저는 저장값만 SVG로 렌더링한다.
- 사진 단계 완료 guard는 같은 상담의 persisted landmark 5개 이상, contour 1개 이상, measurement 4개 이상을 서버에서 다시 확인한다. 고객용 V2 분석 API가 임의 `AnalysisEvidenceV2`를 직접 저장하던 경로는 draft 기반 서버 분석으로 교체했다.
- 품질 통과 결과 2~3개로 shortlist할 수 있으며, V2 shortlist/selection/confirm, salon brief, aftercare dual-write를 연결했다.
- 원격에 선행 적용된 `20260808090000_extend_hairstyle_blueprint_v4.sql`의 `ca8afd9` 계보는 승인 후 8개 충돌을 수동 해소해 로컬 커밋 `1fba021`로 통합했다. 25개씩 6개 manifest의 확장 150개와 legacy 32개, 총 182개 blueprint를 검증했고 catalog prompt는 `catalog-v4`를 사용한다. 충돌 해소 과정에서 Web·Expo 모두 같은 `consultationId`와 구조화 `hairProfile`을 생성 접수까지 함께 전달하도록 보존했다. additive mirror migration `202608090001`~`004`는 로컬 fresh-chain과 권한 smoke를 통과한 뒤 승인된 `hair-fit-seoul` 원격에 순서대로 적용했다. 원격 도구가 처음 기록한 실행시각 버전은 대상 이름·원본 SQL 4건을 확인한 뒤 한 트랜잭션에서 파일 버전으로 정규화했고, 최종 이력은 `20260808090000` 다음 `202608090001`~`004`와 정확히 일치한다.
- 실제 인증 live E2E 과정에서 최근 상담 3건을 만들었다. selector 재시도 전에 멈춘 1건은 `photo/draft`로 남아 있다. 분석 완료 2건은 승인된 유료 검증에 이어 사용되어 현재 모두 `previews/preview_board_queued`이며, 하나는 전체 실패·10-credit 자동 환원 generation, 다른 하나는 8/9 품질 통과·10-credit committed generation에 연결됐다. 테스트 산출물임을 명시하고 임의 삭제하지 않았다.
- 원격 V2 필수 테이블 17/17은 RLS enabled+forced이며 anon/authenticated SELECT가 모두 회수되어 있다. transition/selection RPC는 service role만 실행 가능하다.
- 원격 적용 후 12개 신규/변경 column과 10개 constraint, 7개 함수의 고정 `search_path`, service-role 전용 execute, 비공개 `aftercare-photos` 버킷을 catalog에서 직접 확인했다. 보안 advisor는 적용 전후 동일한 52건으로 새 경고가 없고, 성능 advisor에는 막 생성돼 아직 사용 이력이 없는 `styling_sessions` FK 조회 인덱스 2건만 INFO로 추가됐다.
- landmark 구현 체크포인트: 저장소 portrait fixture에서 얼굴 1명·478 keypoint, 핵심 landmark 13개·실제 contour·측정선 13개를 실제 서버 FaceMesh 경로로 추출했다. hermetic 브라우저 집중 검증에서는 저장된 얼굴 사진 위 SVG가 detected landmark/contour, inferred hairline, measurement, skin sample, excluded region을 렌더링하고 nose-tip 보정 뒤 `user_adjusted`, `data-original-x`, correction revision을 유지했다. 추가 live E2E에서 동일 상담의 원격 `analysis_evidence_v2`가 `tensorflow-js / MediaPipeFaceMesh`, landmark 13개, contour 1개, measurement 13개, correction revision 0을 보존하고 Scan 사진 위에 실제 렌더링하는 것을 확인했다.
- 실제 인증 통합 smoke: 별도 `playwright.live.config.ts`는 Clerk 개발 인스턴스에서 기존 `+clerk_test` HairFit member를 이메일·사용자 ID 출력 없이 찾는다. stock portrait를 실제 UI에서 업로드한 뒤 private draft 201, 서버 사전검사, FaceMesh, 라이브 생성형 AI 분석 200, Evidence 6개, 8축 추천, `analysis_ready`, snapshot 저장, Scan 전환과 landmark overlay까지 한 상담 ID로 51.8초에 통과했다. 후속 무차감 smoke는 Scan 검토→Analysis→Direction→Previews, paid-action quote 201과 `isAllowed=true`까지 15.2초에 통과했고 `/api/generations/accept` 호출 0회, `source_generation_id=null`, 사용자 잔액 불변을 원격에서 확인했다.
- 승인된 유료 실생성은 실패 복구와 정상 경로를 모두 확인했다. 첫 접수는 개발 서버가 inert OpenNext Workflow binding을 선택하고, V2 attempt↔variant embed가 두 FK 때문에 모호하며, `generating` attempt의 fenced 재호출이 비멱등적인 세 결함을 드러냈다. 이 generation은 9개 모두 실패한 뒤 `generation_credit_reservations.state=released`, 10-credit 전액 환원, 현재 잔액=예약 전 잔액으로 자동 복구됐다. 개발 loopback runner 우선, `generation_attempts_v2_preview_variant_id_fkey` 명시, `generating` 재진입 허용을 적용한 두 번째 접수는 outbox `local:*`, preparation ready, 실제 이미지 8개 completed/V2 accepted, 오류 없는 순차 처리, 한 슬롯의 3회 `style_mismatch` 품질 거절을 기록했다. 영수증은 `committed`, amount 10, 현재 잔액은 `balance_after_reservation`과 일치한다. 부분 결과 2개 이상 비교 계약은 충족하지만 사용자가 추가 실인증을 패스해 실제 shortlist 이후 row는 만들지 않았다.
- Aftercare는 시술 record를 먼저 확정한 뒤 동의한 파일만 Sharp 정규화·SHA-256 fingerprint와 함께 비공개 `aftercare-photos` 버킷에 저장한다. 고객 snapshot에는 URL 대신 service ID·fingerprint·업로드 시각만 남기고 계정 삭제 outbox에도 포함한다. DB는 path·fingerprint·consent timestamp가 모두 비어 있거나 모두 채워지는 bundle constraint를 강제한다. 공개 스키마의 `request_account_deletion(text)`는 고정 `search_path=''`의 `SECURITY INVOKER` wrapper이고, 실제 권한 상승 삭제는 비노출 `private.request_account_deletion_v2(text)`의 `SECURITY DEFINER` helper로 격리했다. 두 함수 모두 `service_role`만 execute할 수 있다. PostgreSQL 16 직접 권한 smoke에서 service role 삭제·tombstone 기록은 성공했고 anon/authenticated execute는 모두 거부됨을 확인했다.
- Fashion Scene 11은 정적 `LOOKS`와 구 Styler 마법사 링크를 제거했다. 확정 V2 snapshot과 구조화 방향을 정확히 9개 슬롯에 매핑하고 추천→최신 유료 견적→실제 AI 생성→완료 세션 2~3개 shortlist→최종 룩 확정을 한 Scene에서 처리한다. 다른 상담·다른 snapshot·미완료 세션 ID는 서버가 거부한다.
- Expo는 `/consulting`을 기본 상담 진입점으로 사용한다. 활성 V2 상담 ID를 SecureStore에 보존하고, 같은 `consultationId`로 업로드·서버 사전검사·FaceMesh/AI 분석·유료 생성 접수를 연결한다. 서버 normalized landmark/contour를 native overlay로 표시하고 3×3 board, persisted shortlist, 선택·확정, salon brief까지 재개한다.
- Expo 55.0.28의 권장 조합에 맞춰 앱과 `ui-native`의 React Native를 0.83.10으로 정렬했다. 실제 연결 기기는 SM-S936N(Android 16/API 36)이었으나 설치된 `com.hairfit.app`은 2026-05-03의 0.0.0 stale build였고 Expo Go 55.0.5는 프로젝트 권장 55.0.7과 달랐다. 포트 8081은 다른 ActivityTime 세션이 사용 중이어서 8082로 현재 bundle을 기동했지만 ADB가 이후 무응답이 되었고 공유 세션을 보호하기 위해 당시 server restart를 하지 않았다. Expo Go는 SDK 53 이후 Android remote push를 지원하지 않으므로 push 검증에는 현재 development build가 필요하다. 따라서 실제 기기 UI smoke는 통과로 표시하지 않는다.
- 추가 보완: 사용자가 편집한 Salon Brief 필드를 V2 버전에 저장하고, Aftercare today/checkpoints/concerns/satisfaction을 실제 시술 이후 versioned server patch로 유지한다. landmark 수동 보정은 Web/Expo 모두 같은 API를 사용한다.
- 최종 회귀: 모든 workspace typecheck 통과, lint 0 error(기존 Expo generic-array warning 1건), generation workflow 69/69, 상담 계약 16/16, HairFit V2 계약 15/15, CSS 계약 9/9, Expo Jest 41 suite·170 test, Next production build 130 route, Expo Web/iOS/Android bundle, Chromium Playwright 79/79가 통과했다. 실제 정면 얼굴 fixture가 시스템 사전검사를 통과하고 로고는 차단되는 브라우저 계약과 새 AI 컨설턴트 CTA의 320/375px visual baseline도 확인했다. CSS 파일 변경과 diff whitespace 오류는 없다. 실인증 재실행은 사용자 지시로 최종 회귀에서 제외했다.
- 미완료: 승인된 10-credit 생성은 8/9 품질 결과까지 확인했지만 실제 계정 shortlist→최종 선택→Salon Brief→Aftercare/Fashion은 사용자 지시로 패스했다. `SALON_BRIEF_V2_ENABLED`·`STYLING_LINK_V2_ENABLED` 단계적 활성화와 Expo 현재 development build를 사용한 실제 기기/background/deep link/push/구매 복원 및 Fashion/Aftercare 전체 native smoke도 남아 있다. 따라서 골은 완료 처리하지 않는다.
