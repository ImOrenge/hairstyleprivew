# P19 Cloudflare HairFit V2 OFF 배포 결과

- 실행일: 2026-08-11 KST
- source revision: `19b5d682088bbd71083ce273e8efc0b8a06b18c2`
- server Worker/version: `hairstyleprivew` / `82eabfb8-3016-4216-9dd8-7e8e24f71d42`
- router Worker/version: `hairstyleprivew-router` / `8221300d-eace-4332-9c69-4f22f43420d9`
- 판정: `production_off_pass / public_canary_pending`

## 배포 계약

- OpenNext server와 middleware/assets를 별도 Worker로 분리했다.
- server upload gzip은 `3,049.89 KiB`, router는 `189.10 KiB`로 Workers Free 3 MiB 한도를 통과했다.
- `hairfit.beauty`, `www.hairfit.beauty` Custom Domain은 server 원점에 유지하고, 동일 hostname의 classic route 두 개가 router를 호출한다.
- router는 version override로 위 server version을 pin하고 4개의 인증 binding만 보유한다. provider·결제·callback/admin secret은 복제하지 않았다.
- HairFit 운영 live Clerk 키가 있는 승인 환경에서 값 비노출 upload를 수행했다. secret 값은 로그·문서·채팅에 기록하지 않았다.

## 운영 smoke

3회 연속 다음 결과를 확인했다.

| 경로 | 기대 | 결과 |
|---|---:|---:|
| `/.well-known/hairfit-router` | pinned server version | 일치 |
| `/.well-known/hairfit-deployment` | source revision | 일치 |
| `/` | 200 | 통과 |
| `/login` | 200 | 통과 |
| `/workspace` 비인증 | login 307 | 통과 |
| `POST /api/v2/consultations` 비인증 | 401 | 통과 |
| `https://www.hairfit.beauty/` | 200 | 통과 |

V2 server flag 25개는 OFF다. `/consulting/new`의 Next streaming shell이 HTTP 200을 반환할 수 있으나 RSC payload는 `/workspace` 307 redirect를 포함하며 상담 workspace를 공개하지 않는다.

## 발견·수정한 운영 결함

1. Custom Domain과 classic route를 빠르게 연속 변경할 때 PoP별 전파가 섞일 수 있어 전환 뒤 30초 안정화와 반복 probe를 게이트에 추가했다.
2. router가 server Worker secret을 자동 상속하지 않아 보호 API가 503을 반환했다. router에 정확한 Clerk/Supabase 인증 4개만 등록했다.
3. 개발 Clerk test 키를 운영 router에 사용할 수 없도록 sync 스크립트가 live 키를 강제한다.
4. warm isolate의 `process.env`에 이전 key가 남아 401/503이 섞이던 문제를 현재 encrypted binding으로 매 요청 동기화하도록 수정했다.
5. Clerk 구성 판정을 module load 전역 상수에서 요청 시점 평가로 옮겼다.

## 롤백 증거

전환 중 route를 `hairstyleprivew`로 되돌리고 기존 server version을 100%로 복원하는 실제 리허설을 수행했다. root/login/workspace/www 복구를 확인한 뒤 다시 router 구조로 전환했다. Worker나 데이터는 삭제하지 않았고 additive schema도 보존했다.

## 남은 종료 게이트

- 공개 Web canary 5→25→100%와 관찰 창
- 실제 비용을 소비하는 hair 3×3·Fashion 9-look generation 및 partial/retry
- actual service 이후 Brief/Aftercare live lifecycle
- Expo development build 실기기 parity
- 승인된 실제 사용자 사진 검증(현재 실분석은 저장소 demo fixture)

따라서 production OFF 배포는 완료지만 전체 HairFit V2 goal은 아직 완료가 아니다.

스태프 0% 카나리 시도와 최신 OFF 재고정 과정은 `p20-staff-canary-attempt-and-off-recovery-2026-08-11.md`를 따른다.
