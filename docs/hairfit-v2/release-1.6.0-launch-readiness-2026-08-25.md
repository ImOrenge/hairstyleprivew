# HairFit 1.6.0 출시 준비 체크리스트

## 현재 판정

- 소스 릴리즈 후보: 검증 후 `release/1.6.0`에 fast-forward 가능한 상태로 준비한다.
- 운영 출시: 아래 외부 증거가 모이기 전까지 `NO-GO`다.
- 이 문서는 운영 DB 적용, Worker 배포, 트래픽 전환, 대량 메일 발송을 승인하지 않는다.
- 기존 로컬 `v1.6.0` 태그는 이동하거나 다시 만들지 않는다.

## 고정된 출시 계약

- 고객 기능 출시 모드는 `npm run hairfit-v2:cloudflare:launch`로 계획을 확인한다.
- 출시 모드에서도 `ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED=false`를 유지한다.
- 직원 전용 메이크업 의미 분석 경로는 `MAKEUP_SEMANTIC_VISION_STAFF_ONLY=false`로 닫는다.
- 고객용 메이크업 레시피 카탈로그와 shadow 검증은 활성화한다.
- `MARKETING_EMAIL_DELIVERY_MODE=test`를 유지한다. 실제 프로모션 대량 발송은 별도 승인과 법률 검토 후 `live`로 전환한다.
- `--apply` 없이 실행한 Cloudflare 명령은 계획만 출력하며 Worker 버전이나 트래픽을 변경하지 않는다.

## 출시 순서

1. 릴리즈 커밋과 두 마이그레이션 디렉터리가 동일한지 확인한다.
2. 연결된 Supabase 프로젝트에 `db push --dry-run`을 실행해 적용 목록을 검토한다.
3. 운영 백업과 변경 창을 확인한 뒤 승인된 담당자가 additive migration을 적용한다.
4. V2 카탈로그의 `full_style_once`, `full_style_quarterly`, `full_style_annual` 활성 상태와 가격 snapshot을 읽기 전용으로 확인한다.
5. Cloudflare 필수 secret 이름과 빌드 시점 공개 변수를 확인한다. 값은 로그에 출력하지 않는다.
6. 정확한 40자 릴리즈 커밋 SHA로 launch Worker 버전을 업로드하되 아직 트래픽을 보내지 않는다.
7. staff/canary에서 Clerk 로그인, 유료 권리, 상담 시작, 사진 등록, 분석, 남성·여성 헤어 3×3, AI Top 3와 고객 최종 선택, 메이크업 레시피·시뮬레이션·리포트, 패션, 결과·PDF, 애프터케어를 확인한다.
8. PortOne sandbox 실제 승인·webhook·권리 발급·중복 webhook·환불 견적을 하나의 결제로 검증한다.
9. Resend 테스트 수신함에서 서비스 개편 안내와 `(광고)` 프로모션 템플릿, 수신거부 헤더와 즉시 철회를 확인한다. 대량 발송은 하지 않는다.
10. 공개 랜딩, 상품, 디스커버리, sitemap, robots, 결제 고지의 모바일·키보드·스크린리더 동작을 확인한다.
11. 오류율과 생성 실패율을 관찰할 수 있을 때만 점진적으로 트래픽을 전환한다.

## 운영 전 필수 증거

| 영역 | 출시 전 증거 | 실패 시 조치 |
|---|---|---|
| 데이터베이스 | dry-run과 실제 적용 목록 일치, migration mirror 일치, 카탈로그 V2 3종 활성 | 적용 중단, 이전 Worker 유지 |
| 인증 | 실제 출시 도메인 Clerk 로그인·로그아웃·세션 복구 | 트래픽 전환 금지 |
| 결제 | PortOne sandbox 실제 승인부터 entitlement까지 단일 추적 | 체크아웃 플래그 OFF |
| AI 생성 | 남성·여성 헤어 3×3 및 메이크업 레시피 실제 제공자 증거 | 생성 플래그 OFF, 기존 결과 열람 유지 |
| 결과 | 고객 선택이 Salon Brief·메이크업·패션·종합 리포트·PDF에 동일 반영 | 결과 진입 차단 대신 fallback 유지, 원인 수정 |
| 이메일 | 관리자 테스트 발송, 동의·수신거부·억제 대상 제외 | delivery mode `test` 유지 |
| 복구 | 이전 Worker 버전과 기능 OFF payload 준비 | 기능 OFF 후 이전 버전으로 복귀 |

## 알려진 비차단/별도 판정 항목

- Supabase 보안 advisor의 public `citext` 경고는 함수와 search path 의존성을 검토한 별도 migration으로 해결한다. 출시 직전 즉흥적으로 schema를 옮기지 않는다.
- Expo/Metro가 의존하는 `image-size` 보안 권고는 현재 공개된 패치 버전이 없어 강제 downgrade나 lockfile override를 적용하지 않는다. 웹 출시와 모바일 스토어 제출의 위험 판정을 분리한다.
- 모바일 스토어 제출은 Android/iOS 서명, 실제 기기, 스토어 결제 증거가 준비된 별도 릴리즈다.

## 정적 게이트

다음 명령이 같은 릴리즈 커밋에서 통과해야 한다.

```text
npm run consulting:contract:test
npm run hairfit-v2:contract:test
npm run full-style-refund:contract:test
npm run email-campaign:contract:test
npm run supabase:migrations:mirror:check
npm run component-registry:validate
npm run typecheck
npm run lint
npm run build
npm run release:environment:preflight -- --mode=source --environment=release-candidate
```
