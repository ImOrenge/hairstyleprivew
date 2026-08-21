# 컨설팅 결과 명세서·PDF Acceptance Matrix

## 사용법

- 상태는 `planned -> in-progress -> verification -> complete`만 사용한다.
- 증거가 없는 항목은 `complete`로 바꾸지 않는다.
- local, staging, production, physical-device 증거를 분리한다.
- screenshot 한 장은 데이터 계약, 권한, PDF 다운로드 전체를 증명하지 않는다.

## A. 데이터와 재현성

| ID | Given | When | Then | 증거 |
| --- | --- | --- | --- | --- |
| A-01 | consultation v12 | full snapshot 생성 | snapshot은 v12와 source IDs를 고정 | contract test + row |
| A-02 | consultation이 v13으로 변경 | v12 snapshot 조회 | 내용과 digest가 바뀌지 않음 | digest 비교 |
| A-03 | 같은 source/profile/locale | snapshot 재요청 | 기존 snapshot 재사용 | concurrency test |
| A-04 | stale expected version | snapshot 생성 | 409 conflict | API test |
| A-05 | selection evidence ID 불일치 | projection | 422 invalid, PDF 없음 | negative fixture |
| A-06 | strategy가 selection보다 최신 | report 생성 | stale/partial 안내 | fixture + UI |

## B. 레이아웃과 인쇄

| ID | 조건 | 기대 | 증거 |
| --- | --- | --- | --- |
| B-01 | A4 portrait | 12 mm 여백, 잘림 없음 | print PNG/PDF |
| B-02 | Letter portrait | 핵심 내용 잘림 없음 | print PNG |
| B-03 | 320/375 px | 가로 스크롤 없음 | Playwright |
| B-04 | 긴 표 30행 | header 반복, 행 단위 나눔 | PDF pages |
| B-05 | 9 images | 비율 유지, 15 MB 이하 | PDF inspect |
| B-06 | print mode | toolbar/app shell 숨김 | CSS/E2E |
| B-07 | 흑백 | 상태를 텍스트로 구분 | grayscale QA |
| B-08 | 200% zoom | 정보 손실·겹침 없음 | browser QA |

## C. P7 결과 탭과 콘텐츠

| ID | 섹션 | 필수 검증 |
| --- | --- | --- |
| C-00 | Tab Contract | `hair → color → makeup → fashion → final` 순서, 기본 `final`, section 중복 소유 0, query/keyboard 동기화 |
| C-01 | Executive Summary | 확정 Hair+Color hero, 4개 결과, 근거 3개, 임의 점수 없음 |
| C-02 | Face/Hair Analysis | 한국형 두상 posterior·top2·비율·관찰·Hair 연결, raw photo 없음 |
| C-03 | Personal Color | 12타입·4축·capture/diagnosis 신뢰도 분리·5 palette 군 |
| C-04 | Hair Direction | 8축 Blueprint와 명세표가 동일 payload 사용 |
| C-05 | Candidate Compare | accepted winner/runner-up/alternative 3개와 선택·미선택 이유 |
| C-06 | Final Hair | immutable selection, 구조·실루엣·feasibility·limitations |
| C-07 | Final Color | current revision, 색·레벨·기법·탈색·퇴색·위험 |
| C-08 | Salon Specification | 고객 요약+전문 명세, 레이어 시작/끝·변경 가능/금지 요소 없음 |
| C-09 | Makeup Result | mood image+중복 없는 7 module board, landmark/debug data 없음 |
| C-10 | Fashion Result | final 1+서로 다른 accepted alternative 2, current color provenance |
| C-11 | Initial Care | Final 탭에 확정 결과 기반 초기 24시간·3일·7일 안내와 최대 7개 checklist, 프로그램 상태 없음 |
| C-12 | Metadata/Notice | ID·versions·timestamp·digest·고지는 header/footer에만 표시 |
| C-13 | Omission | request/input quality/task/not_started section과 빈 선택 탭이 본문에 없음 |
| C-14 | Aftercare Boundary | actual treatment·알림·관찰·만족도는 Report source/PDF에 없고 별도 프로그램에서만 처리 |

## D. PDF

| ID | 조건 | 기대 | 증거 |
| --- | --- | --- | --- |
| D-01 | ko-KR full fixture | tofu glyph 0 | text/render 검사 |
| D-02 | export 요청 중복 | job/binary 1개로 수렴 | idempotency test |
| D-03 | worker duplicate delivery | ready 상태 1회 확정 | worker test |
| D-04 | image timeout | 제한 재시도 후 안전 실패/partial 정책 | failure injection |
| D-05 | oversized input | 렌더 전 413 | API test |
| D-06 | ready PDF | header/EOF/page/text 검사 통과 | parser result |
| D-07 | PDF text | signed URL/token/storage path 없음 | secret scan |
| D-08 | renderer 변경 | renderer version과 새 export 구분 | metadata test |

## E. 보안과 개인정보

| ID | 행위 | 기대 | 검증 환경 |
| --- | --- | --- | --- |
| E-01 | B가 A snapshot 조회 | 404/denied | staging auth |
| E-02 | salon share로 full 요청 | denied | staging auth |
| E-03 | raw photo 기본 생성 | included=false | unit+staging |
| E-04 | raw photo opt-in | consent/audit 후 full에서만 포함 | staging auth |
| E-05 | 외부/private IP image | fetch 차단 | unit/security |
| E-06 | 5분 지난 download URL | 접근 실패 | staging storage |
| E-07 | 24시간 지난 binary | expired + object cleanup | staging retention |
| E-08 | audit/log scan | email, ID, token, photo URL 없음 | log sample |

## F. 접근성

| ID | 기대 | 증거 |
| --- | --- | --- |
| F-01 | h1 -> h2 -> h3 순서 | DOM test |
| F-02 | definition/table semantic 사용 | accessibility tree |
| F-03 | status가 색에만 의존하지 않음 | axe+manual |
| F-04 | 이미지 alt와 인접 선택 텍스트 | component test |
| F-05 | dialog focus trap/Escape/return | Playwright |
| F-06 | serious/critical violation 0 | axe |

## G. 운영

| ID | 지표 | 기준 |
| --- | --- | --- |
| G-01 | export success | 99% 이상 |
| G-02 | ready p95 | 15초 이하 |
| G-03 | queue oldest | 60초 이하 |
| G-04 | PDF 크기 | 15 MB 이하 |
| G-05 | 페이지 | 24 이하 |
| G-06 | cleanup lag | 6시간 이하 |
| G-07 | cross-user incident | 0 |

## H. 회귀와 롤백

| ID | 기대 | 증거 |
| --- | --- | --- |
| H-01 | 모든 report flag off에서 현재 15 Scene 정상 | E2E |
| H-02 | legacy `/result/[id]` 정상 | result contract/E2E |
| H-03 | PDF flag만 off에서 receipt print 정상 | E2E |
| H-04 | receipt flag off에서 snapshot/API 내부 검증 가능 | API test |
| H-05 | rollback 후 기존 snapshot 보존 | DB check |
| H-06 | worker intake 중단 시 active job 손상 없음 | rehearsal |
| H-07 | consultation Result가 split canvas 없이 5개 탭·탭별 단일 세로 Report로 표시 | component+E2E |

## 최종 승인 체크리스트

- [ ] P0 ADR과 privacy 결정 승인
- [ ] P1 migration/API/RLS 완료
- [ ] P2 Web receipt/print 완료
- [ ] P3 PDF/storage/download 완료
- [x] P4 15-stage 원본을 14개 보고서 section으로 투영하는 adapter 완료
- [ ] P5 retention/audit/SLO 완료
- [ ] P6 staging/canary/physical-device 증거 완료
- [ ] P7 5개 탭·11개 결과 section·초기 케어/Aftercare 분리·ViewModel V2 구현 완료
- [ ] rollback rehearsal 완료
- [ ] production에 실제 적용하지 않은 항목을 명시
