# HairFit V2 P38 semantic makeup canary·rollback runbook

- 작성일: 2026-08-15
- 상태: 운영 실행 전 준비본
- 이 문서는 배포 승인이나 provider 비용 집행 권한을 부여하지 않는다.

## 플래그

| 플래그 | 안전 기본값 | 역할 |
|---|---|---|
| `MAKEUP_DENSE_ATLAS_V3` | ON | deterministic V3 atlas |
| `MAKEUP_SEMANTIC_VISION_V3` | OFF | provider dispatch·semantic projection |
| `MAKEUP_SEMANTIC_VISION_STAFF_ONLY` | ON | admin 계정만 semantic 허용 |

금지 조합은 semantic ON + dense atlas OFF다. 이 경우 semantic을 먼저 OFF한다.

## 사전 게이트

- 현재 provider/model 가용성·가격·retention을 공식 자료로 당일 확인
- test 환경의 strict schema mock, timeout, invalid output, protected-region crossing 검증
- capability task/attempt/result 테이블과 claim/complete RPC 존재 확인
- 실제 사진은 명시적 내부 검증 동의와 삭제 기한 기록
- 로그에 원본/reference 이미지, URL, path, user/consultation ID 원문, landmark JSON, raw 모델 응답이 없는지 확인
- dashboard 또는 쿼리에서 성공률, complete/partial/fallback, p50/p95, retry, 비용 receipt만 집계

## 단계적 rollout

| 단계 | 설정 | 최소 관찰 | 승격 조건 |
|---|---|---|---|
| 0 | semantic OFF | 로컬·mock | 빌드/계약/E2E 통과 |
| staff | semantic ON, staff-only ON | 승인 표본 또는 24시간 | 성공률 98% 이상, valid complete/partial 95% 이상, 보호영역 관통 0 |
| 10% | staff-only OFF + 외부 cohort gate 10% | 24시간 | error/latency/cost budget 통과 |
| 50% | cohort 50% | 24시간 | 지표 악화 없음, fallback 빈 화면 0 |
| 100% | cohort 100% | 24시간 집중 관찰 | 운영 승인 기록 |

현재 코드 플래그는 staff gate까지만 소유한다. 10/50/100 cohort는 배포 플랫폼 또는 승인된 실험 시스템에서 별도로 구성하며 코드에 무작위 비율을 하드코딩하지 않는다.

## 즉시 중단 조건

- 보호 영역 관통 1건 이상
- 원본 사진/식별자/URL/좌표의 외부 로그 노출
- 잘못된 source fingerprint projection 렌더
- deterministic fallback이 사라지는 오류
- provider 호출 폭증 또는 fingerprint replay 실패
- 승인 비용·p95 latency 예산 초과

## rollback

1. `MAKEUP_SEMANTIC_VISION_V3=false`로 provider 호출과 semantic 합성을 끈다.
2. 문제가 atlas 자체이면 `MAKEUP_DENSE_ATLAS_V3=false`로 P37 V2로 내린다.
3. 조사 중에는 `MAKEUP_SEMANTIC_VISION_STAFF_ONLY=true`를 유지한다.
4. 기존 task/result/snapshot은 삭제하지 않는다. flag OFF에서 읽지 않을 뿐이다.
5. GET makeup, module patch, confirm, routine, artist brief가 정상인지 smoke test한다.

rollback drill 합격 기준:

- semantic OFF 이후 신규 provider 호출 0
- 기존 consultation에서 deterministic map과 7개 모듈 유지
- 사용자 조정 revision과 confirmed snapshot 불변
- 재활성화 시 같은 fingerprint completed result replay, 추가 호출 0

## 증거 기록 양식

```text
환경/배포 ID:
기간:
승인자:
provider/model (비밀값 제외):
표본 수:
success / partial / fallback / rejected:
p50 / p95:
retry 수:
fingerprint replay 추가 호출 수:
보호영역 관통 수:
비용 receipt 합계:
rollback drill 결과:
결론: hold / expand / rollback
```

실 provider canary, 배포, 실제 고객 사진 및 비용 집행은 별도 승인을 받은 뒤 이 양식으로 증거를 남긴다.
