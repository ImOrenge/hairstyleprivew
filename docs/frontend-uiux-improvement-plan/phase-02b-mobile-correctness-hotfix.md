# Phase 02B — 모바일 정확성 핫픽스

- 상태: implemented_pending_manual — 소스·계약·bundle 검증 완료, 로그인 계정 실기기 조작 대기
- 우선순위: 빠른 사용자 개선
- 변경 게이트: `patch`, `behavioral`
- 선행 페이즈: Phase 02A의 최소 selector 계약
- 독립 배포: 가능

## 목표

현재 코드로 확정된 모바일의 잘못된 비용·route·문서 정보를 큰 구조 변경 전에 바로잡는다.

## 포함 범위

- [x] 마이페이지 헤어 생성 가능 횟수의 `credits / 5` 제거
- [x] 공통 정책 selector로 10크레딧 기준 계산
- [x] 처리 중 generation 기록은 `/generate/:id`, 완료 기록은 `/result/:id`로 이동
- [x] 마이페이지 플랜/결제 panel에 실제 `/billing` 진입 CTA 추가
- [x] `/billing`이 현재 계정·플랜 snapshot을 표시하도록 최소 연결
- [x] `docs/mobile-port-map.md`의 존재하지 않는 onboarding과 billing entry 상태 정정
- [x] `docs/mobile-sync-e2e-report.md`가 오래된 snapshot임을 명확히 기록하거나 최신 static report로 갱신
- [x] 상태별 route와 사용량 계산 regression test

## 제외 범위

- 결제 후 원래 유료 행동 복귀
- 실결제 성공·취소·실패 상태 재설계
- MFA, 비밀번호 재설정, onboarding 구현
- 전체 마이페이지 컴포넌트 분해
- 네이티브 `Screen` 교체

## 예상 파일

- `apps/hairfit-app/app/mypage.tsx`
- `apps/hairfit-app/app/billing.tsx`
- `packages/shared/src/index.ts`
- `packages/api-client/src/index.ts`
- `docs/mobile-port-map.md`
- `docs/mobile-sync-e2e-report.md`
- `scripts/mobile-sync-verify.mjs`

## 수용 기준

- 10크레딧 계정은 헤어 생성 가능 약 1회로 표시된다.
- queued/processing/partial 상태 기록은 진행 화면을 연다.
- completed 상태만 결과 화면을 연다.
- 사용자가 마이페이지에서 billing 화면에 도달할 수 있다.
- 포트 맵은 실제 파일 존재와 구현 상태를 과장하지 않는다.
- `mobile:sync` 통과를 실기기 검증으로 표현하지 않는다.

## 검증

```powershell
npm run typecheck
npm run mobile:sync
npm run portone:mobile:smoke
# 신규: generationDestination fixture test
```

수동 확인:

- 크레딧 0, 10, 20 계정 표시
- processing/completed 기록 tap
- 마이페이지 → billing 진입과 뒤로가기

## 롤백·인계

- 서버·DB 변경 없이 selector 사용처만 되돌릴 수 있다.
- Phase 06에는 billing 진입점과 상태별 return context를 넘긴다.

## 2026-07-15 구현 증거

- `/5` 제거 후 서버 `creditPolicy.hairstyleGeneration`과 공통 `estimateHairstyleGenerations` 사용
- completed 후보 수까지 조합해 부분 완료는 `/generate/:id`, 전부 완료만 `/result/:id`로 이동
- Styler `recommended`는 “추천 준비됨”으로 별도 표시
- `/billing`은 서버가 제공한 self-serve catalog만 렌더링하며 가격·지급 크레딧을 로컬 상수로 복제하지 않음
- 계정/대시보드 중 하나가 실패해도 성공 snapshot은 유지하고, 둘 다 실패하면 `Free / 0`을 거짓 표시하지 않음
- 검증: shared 5/5, mobile PortOne smoke, `mobile:sync` 103/103, 앱 typecheck·lint, Expo web/iOS/Android export 통과
- 제한: 위 검증은 실결제·실기기 E2E가 아니며 크레딧 0/10/20 계정과 processing/partial/completed tap은 수동 확인 필요
