# HairFit V2 P0 source freeze evidence

기준 시각은 2026-08-11 KST다. [source manifest](source-manifest-2026-08-11.json)가 이 Phase의 기계 판독 가능한 정본이다.

## Git 기준선

| 항목 | 값 |
|---|---|
| 작업 브랜치 | `feat/2026-08-08-hairfit-v2-backend` |
| 작업 HEAD | `347626045335c09606d4b05286a12d8f3ba8bb2d` |
| fetch한 source | `origin/main` |
| source SHA | `40c6f753e6c5b1e8e5913f2ec542f0f4b27e2501` |
| merge-base | `489005a6e95e83e3072c69ddedc9b777ca177ff0` |
| 고유 commit | 작업 브랜치 14 / source 17 |

`git fetch origin main --prune` 이후 local `main`과 `origin/main`이 같은 SHA임을 확인했다. 이 문서 작성은 branch 전환·merge·rebase·commit·push·deploy 권한을 포함하지 않는다.

## 엔진 출처 판정

여섯 capability의 engine source, 공개 export, legacy caller, Git blob, SHA-256은 manifest에 고정했다.

- Hair Blueprint Recommendation
- Hair Preview Generation
- Personal Color Analysis
- Salon Brief Generation
- Aftercare Program Generation
- Fashion Recommendation and Generation

현재 작업트리에서 엔진 파일은 다음처럼 분류된다.

- `hairstyle-catalog-recommendation.ts`는 미추적이지만 `origin/main`과 Git blob 및 byte SHA-256이 동일하다. 삭제하거나 다른 branch 버전으로 덮어쓰지 않는다.
- `recommendation-types.ts`는 main 타입에 V2 preview provenance optional field 6개를 추가했다.
- `fashion-types.ts`는 main 타입에 V2 consultation snapshot optional field 5개와 shared type import를 추가했다.
- 위 두 additive 확장을 제외한 manifest engine source는 Git 정규화 기준으로 `origin/main`과 동일하다. 로컬 CRLF 차이는 source divergence로 판정하지 않는다.
- 기존 consulting, lifecycle, CSS, migration, 문서, 테스트 변경은 같은 HairFit V2 작업 맥락이다. reset·checkout·덮어쓰기를 하지 않는다.

## 권위 순서

1. 원본 Frontend Design Plan DOCX의 페이지·Scene·표면 요구
2. lifecycle workspace completion 문서의 server-owned journey 계약
3. liveness improvement 문서의 waiting·partial·exit 계약
4. legacy engine recycling 문서의 capability 경계
5. interview improvement 문서의 Discovery·Fashion 입력 계약
6. 통합 P0~P17 goal 문서의 실행·종료 순서
7. 이 source manifest의 exact source provenance

충돌 시 더 구체적인 데이터·보안·비용 불변식을 우선하며, 사용자 최신 지시에 따라 별도 유료 생성 확인 질문과 CTA는 구현하지 않는다. entitlement 검증·usage receipt·중복 소비 방지는 서버 내부 계약으로 유지한다.

## 처리 경계

| 상태 | 처리 |
|---|---|
| main과 동일한 엔진 파일 | facade에서 직접 import하되 provider·prompt·비용 로직은 route로 복제하지 않음 |
| V2 additive type | optional field를 유지하고 adapter parity test로 main base 호환 검증 |
| 미추적 main-identical source | 현재 feature 산출물로 보존하고 최종 변경 목록에 포함 |
| 기존 dirty consulting 파일 | 사용자 작업으로 보존하고 필요한 최소 범위만 patch |
| remote DB·live AI·결제 소비·배포 | P16 승인 전 실행하지 않음 |

## P0 검증 명령

- `git fetch origin main --prune`
- `git rev-parse HEAD origin/main main`
- `git merge-base HEAD origin/main`
- `git rev-list --left-right --count HEAD...origin/main`
- `git rev-parse origin/main:<path>`
- `git hash-object --path=<path> <path>`
- raw `git show origin/main:<path>` bytes의 SHA-256 계산
- export와 legacy caller에 대한 `rg` import graph 검사

P0는 source와 소유 경계를 고정할 뿐 엔진 facade, schema, UI 또는 실환경 완료를 주장하지 않는다.
