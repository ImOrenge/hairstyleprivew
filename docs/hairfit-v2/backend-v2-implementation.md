# HairFit V2 backend implementation

작성일: 2026-08-08
기준: `HairFit_V2_Product_Refactor_Phase_Package_2026-08-07`의 Phase 0~9, ADR, 수용 기준, 컷오버 런북

## 구현 경계

이 변경은 완료된 프론트엔드 리팩터링 커밋 `d51ffcb9823d8f94dd60e90f11fe90bea8aad425`에서 이어진다. 프론트엔드가 확정한 페이지/워크벤치형 AI 컨설턴트 구조와 CSS는 변경하지 않는다. `/consulting/{id}/photo`가 private generation draft 업로드와 AI 분석을 직접 수행하고, 근거 검토·전략 확정 뒤 `/consulting/{id}/previews`에서 consultation ID를 generation acceptance에 연결한다. 따라서 사용자가 입력한 상담 옵션과 확정 전략이 백엔드 분석·프롬프트·결과 계약으로 계속 이어진다.

이 작업은 additive backend refactor다. 기존 generation, Result, PortOne, Google Play, legacy credit, hair record, aftercare 경로는 기능 플래그가 꺼진 기본 상태에서 그대로 동작한다. 가격 가설은 운영 가격으로 seed하지 않았고, 실제 상품/가격 승인은 별도 운영 결정이다.

## 모듈과 책임

| 계층 | 구현 | 책임 |
|---|---|---|
| 공유 계약 | `packages/shared/src/v2` | Catalog, Entitlement, Consultation, AnalysisEvidence, PromptInputV2, PreviewBoard, SelectionSnapshot, 출력 DTO와 상태 전이 |
| Web/Expo client | `packages/api-client/src/index.ts` | 동일한 V2 HTTP 계약과 consultation-linked generation acceptance |
| HTTP | `my-app/app/api/v2` | Clerk 인증, 요청 검증, 소유권 범위 전달, 응답 변환 |
| 도메인 서비스 | `my-app/lib/v2` | 카탈로그, 권리, 상담, 분석, 프롬프트, 보드, 선택, 출력, 결제 adapter, 정합성 검사 |
| 기존 workflow adapter | generation/결제/hair-record route와 service | feature flag 기반 dual write와 호환 연결 |
| PostgreSQL | `202608080002_hairfit_v2_backend_core.sql` | 원장, 상태, 불변식, 멱등성, 동시성, RLS, RPC |

Route handler는 provider prompt나 원본 민감 입력을 응답하지 않는다. 데이터 변경 불변식은 service와 PostgreSQL RPC가 맡는다.

## 데이터와 불변식

마이그레이션은 root와 `my-app/supabase/migrations`에 같은 내용으로 유지한다.

- `product_offerings_v2`, `product_prices_v2`: versioned catalog. capability bridge만 seed하며 가격은 seed하지 않는다.
- `customer_entitlement_grants_v2`, `entitlement_consumptions_v2`: 결제 원천과 소비 원장. 결제 원천·상품 키로 멱등 grant를 만들고 consultation당 같은 소비 키의 replay를 허용한다.
- `analysis_evidence_v2`, `personal_color_evidence_v2`: source transform, normalized evidence, confidence/quality, model/version, 제외 영역과 보정 시각을 보존한다.
- `preview_boards_v2`, `preview_variants_v2`, `generation_attempts_v2`: 9개 slot과 개별 attempt를 분리한다. 실패·거절은 같은 slot을 재시도하고 추가 권리를 소비하지 않는다.
- `style_selection_snapshots_v2`: accepted attempt, fingerprint/path, catalog, evidence, 목표/제약, model/prompt/catalog version을 확정 시점에 불변 snapshot으로 보존한다.
- `salon_brief_versions_v2`, `actual_services_v2`, `aftercare_programs_v2`, `fashion_preview_sets_v2`: 동일한 selection snapshot을 참조한다.
- `hairfit_v2_domain_events`, `hairfit_v2_reconciliation_runs`: 민감 입력을 제외한 상태·재시도·품질·정합성 관측 기록이다.

핵심 RPC는 `SECURITY INVOKER`와 빈 `search_path`를 사용하고 browser role 실행 권한을 제거했다. 서버는 service role을 사용하기 전에 Clerk user ID로 소유권을 제한한다. V2 테이블은 RLS를 강제하고 브라우저 role table grant를 두지 않는다.

## 상담과 생성 연결

사진·분석·생성의 실제 실행 순서는 다음과 같다.

1. 브라우저가 형식·용량·디코딩·해상도와 가능한 경우 얼굴 존재를 검사하고, Canvas 픽셀 통계로 노출·색상·선명도·배경 분리 신호를 산출한다.
2. 사전검사를 통과한 인증 사용자가 상담 사진을 기존 private generation draft Storage에 업로드한다.
3. `photo-analysis`가 draft와 consultation 소유권 및 optimistic version을 확인하고 Sharp 기반 시스템 사전검사를 재실행한다. blocking 결과는 AI 호출 전에 `422`로 종료한다.
4. 통과한 사진만 얼굴형·헤어 전략 AI 분석을 실행한다. 8개 사진 품질 카드는 AI 성공 여부에 따른 고정 점수가 아니라 시스템 사전검사 결과다.
5. 분석 결과는 `analysis_evidence_v2`와 consultation snapshot의 Evidence → Meaning → Action 항목에 함께 저장된다.
6. 사용자가 근거를 검토하고 8축 전략을 확정한다.
7. 프리뷰 화면이 paid-action quote를 확인한 뒤 같은 draft를 consultation ID와 함께 accept한다.
8. durable generation workflow가 V2 사용자 옵션 프롬프트, 3×3 slot, quality retry를 실행하고 프리뷰 화면은 V2 board를 폴링한다.

브라우저에는 원본 Storage path, service role, provider prompt, prompt input snapshot을 반환하지 않는다. 원본 확인은 10분 signed URL만 사용한다.

상태 전이는 다음 방향만 허용한다.

```text
draft -> photo_validated -> analysis_ready -> preview_board_queued
      -> preview_board_ready -> shortlisted/style_selected
      -> selection_confirmed -> salon_brief_ready/aftercare_ready/fashion_ready
      -> completed
```

`cancelled`는 허용된 활성 상태에서만 이동한다. `expectedVersion`이 다르거나 불법 전이인 요청은 409로 실패한다. consultation 생성, 권리 소비, preview board 준비, 선택/출력 생성은 idempotency key 또는 DB unique constraint를 가진다.

기존 generation 접수와 V2 consultation 연결은 `attach_generation_to_consultation_v2` RPC에서 양쪽 행을 함께 잠그고 소유권·기존 연결·낙관적 version을 확인한 뒤 원자적으로 반영한다. 따라서 새로고침이나 재접수는 동일 연결로 replay되고, 타 사용자 generation 또는 이미 다른 consultation에 연결된 generation은 거절된다.

프론트엔드의 discovery snapshot에서 다음 값을 실제 `PromptInputV2`로 변환한다.

- 목표와 원하는 서비스
- 현재 모발 설명, 기장, 모량, 굵기, 텍스처, 시술 이력, 손상도
- 유지관리 수준과 손질 가능 시간
- 피하고 싶은 조건과 자유 메모
- analysis evidence와 선택적 personal color evidence
- catalog cycle과 catalog 후보

누락값은 `unknown`으로 유지한다. 사용자 회피·안전·관리 제약이 스타일 희망과 충돌하면 회피·안전·관리 제약을 우선한다. 자유 입력은 untrusted JSON data로 경계 짓고 길이/제어문자를 정규화하여 prompt instruction으로 승격되지 않게 한다.

## PromptInputV2와 accepted nine

Prompt compiler는 같은 정규화 입력에 대해 다음 9개 slot을 결정적으로 만든다.

- 얼굴 균형형(`face_balance`) 3개
- 이미지 변화형(`image_change`) 3개
- 관리 현실형(`manageability`) 3개

각 attempt에는 prompt policy version `hairfit-consultation-prompt-v2`, normalized input snapshot, slot intent, SHA-256 prompt hash, provider/model version이 저장된다. 기존 catalog prompt template `catalog-v3`는 catalog migration 없이 변경하지 않는다.

실제 Gemini provider 입력에는 V2 positive/negative prompt가 전달된다. identity, style, geometry, artifact, background, hair-boundary, safety, exact/near-duplicate gate를 모두 통과한 attempt 한 개만 slot에 accepted된다. 중복 판정은 원본 바이트 SHA-256과 머리 영역 중심 256-bit dHash를 함께 저장하고, dHash Hamming distance 6 이하를 근접 중복으로 거절한다. 정확히 9개가 accepted되어야 board가 ready가 되며, timeout/부분 실패/품질 거절은 최대 3회까지 같은 slot에서 새 attempt로 재시도된다. terminal board failure는 해당 consumption을 restore한다.

attempt 비용은 provider 청구 통화의 minor unit으로 기록한다. `GEMINI_IMAGE_ESTIMATED_COST_MINOR`가 명시된 경우에만 추정값을 저장하며, 미설정/빈 값은 비용을 0으로 가장하지 않고 `null`(unknown)로 남긴다.

고객 generation detail/export와 V2 board 응답에는 provider prompt, normalized input snapshot, prompt artifact token, provider 원문, 비용·lease/output 내부 경로를 노출하지 않는다. 관찰 이벤트 payload도 prompt, secret, token, photo/image/raw/input/face/provider response 계열 키를 제거한다.

## 선택과 출력

shortlist는 accepted variant 최대 3개다. 최종 선택 draft는 consultation version과 함께 원자적으로 생성하고, confirm RPC는 snapshot을 한 번만 잠근다. confirm 후 다른 snapshot으로 변경할 수 없다.

살롱 브리프, 실제 시술 기반 aftercare, personal color 기반 fashion preview는 모두 confirmed `style_selection_snapshots_v2.id`를 참조한다. 기존 generation selection과 hair-record/aftercare route에는 feature-flagged adapter를 두어 V2 snapshot과 연결하되 기존 응답 계약은 유지한다.

## 결제, 환불, legacy 호환

PortOne과 Google Play 결제는 다음 중 하나로만 V2 offering을 매핑한다.

1. 결제 metadata의 명시적 `hairfit_v2_offering_key`와 version
2. 승인된 active `product_prices_v2.provider_product_id`의 정확한 일치

추측 매핑은 하지 않는다. paid dual write는 동일 transaction ID로 멱등 grant를 만들고, refund/void는 해당 grant를 revoke한다. legacy bridge는 기본 OFF이며 기존 credit debit authority를 바꾸지 않는다. 정합성 endpoint는 최근 paid transaction과 grant/version을 비교하여 mismatch sample을 민감정보 없이 기록한다.

## 기능 플래그와 배포 순서

모든 플래그의 기본값은 `false`다.

| 순서 | 플래그 | 목적 | OFF 시 동작 |
|---|---|---|---|
| Schema | 없음 | additive table/RPC 배포 | 기존 read/write 영향 없음 |
| Dual write | `ENTITLEMENT_V2_DUAL_WRITE_ENABLED` | paid/refund 원장을 V2에도 기록 | legacy 결제/권리만 사용 |
| Reconcile | admin endpoint | 결제↔grant mismatch 확인 | 읽기 경로 영향 없음 |
| Shadow read | `ENTITLEMENT_V2_SHADOW_READ_ENABLED` | legacy 결정과 V2 quote 비교 | legacy 결정만 사용 |
| V2 read authority | `ENTITLEMENT_V2_READ_ENABLED` | V2 quote/board 권리 판정을 응답 경로에 사용 | legacy 권리만 사용하고 V2 권리 API는 비활성 |
| Catalog/API | `CATALOG_V2_ENABLED`, `CONSULTATION_SESSION_V2_ENABLED`, `ANALYSIS_EVIDENCE_V2_ENABLED` | 인증된 V2 계약 canary | V2 endpoint 404/비활성 |
| Prompt canary | `PROMPT_POLICY_V2_ENABLED` | 사용자 옵션을 실제 provider prompt에 반영 | 기존 catalog prompt 사용 |
| Board canary | `PREVIEW_BOARD_STRATEGY_V2_ENABLED`, `PREVIEW_QUALITY_GATE_V2_ENABLED` | 3x3 전략과 quality retry | 기존 generation workflow 사용 |
| Output canary | `SALON_BRIEF_V2_ENABLED`, `STYLING_LINK_V2_ENABLED` | snapshot 기반 후속 출력 | 기존 Result/aftercare/styling 사용 |

`ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED`는 별도 opt-in이다. prompt/model/UI는 동시에 실험하지 않는다. prompt canary가 고정된 뒤 board strategy를, quality threshold가 고정된 뒤 provider/model을 각각 독립적으로 변경한다.

컷오버는 schema -> dual write -> reconciliation mismatch 0 -> shadow read -> staff/1%/10%/50%/100% canary 순서다. 유료 grant 누락·중복 소비·refund 불일치·가격 매핑 오류가 1건이라도 있으면 다음 단계로 진행하지 않는다.

## 롤백

1. V2 prompt/board/output 플래그를 OFF로 돌려 기존 generation/Result 경로로 복귀한다.
2. `ENTITLEMENT_V2_SHADOW_READ_ENABLED=false`로 실제 응답을 legacy로 고정한다.
3. 필요하면 `ENTITLEMENT_V2_DUAL_WRITE_ENABLED=false`로 신규 V2 원장 기록을 멈춘다.
4. 이미 생성한 consultation, grant, attempt, snapshot, audit row는 hard delete하지 않는다.
5. 잘못된 권리는 revoke/restore 사건으로 보정하고 reconciliation을 다시 실행한다.
6. schema 제거는 운영 관찰과 deletion ADR 이후 별도 destructive migration으로만 수행한다.

## 보존과 삭제

- 계정 삭제는 기존 `users` 삭제 흐름을 권위로 하며 user-owned V2 aggregate는 FK cascade로 제거된다.
- 상품 카탈로그, 가격, 결제 참조 grant는 감사·환불 정합성을 위해 user aggregate와 분리하고 hard delete하지 않는다.
- selection/brief/aftercare/fashion은 consultation과 함께 삭제되며, accepted/rejected generation object는 기존 generation storage retention/cleanup 정책을 따른다.
- signed URL은 저장하지 않고 요청 시 owner/scope를 확인한 뒤 기존 generation storage helper의 짧은 TTL URL만 반환한다.
- 실제 시술 사진과 outcome learning은 이 변경에서 활성화하지 않는다. 별도 동의, 철회, retention job과 deletion ADR 없이는 수집 대상으로 확대하지 않는다.
- 운영 retention job과 원격 storage deletion은 이번 로컬 구현 범위가 아니다. 배포 전 staging에서 기존 계정 삭제·storage cleanup 작업과 함께 검증해야 한다.

## 로컬 구현 범위 밖

- 운영 상품/가격 승인 및 seed
- 원격 Supabase migration 또는 데이터 변환 실행
- 실제 PortOne/Google Play/provider webhook 재생
- 실제 AI provider 호출, 배포, canary, 장시간 관찰
- legacy table/API 삭제
- outcome learning 및 실제 시술 사진 수집

이 항목은 로컬 fixture/mock 검증을 대체하지 않으며, release readiness에서 별도 증거가 필요하다.
