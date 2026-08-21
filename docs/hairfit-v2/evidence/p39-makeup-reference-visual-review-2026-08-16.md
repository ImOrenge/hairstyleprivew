# HairFit V2 P39 메이크업 정밀 레이어 시각 검토

- 검토일: 2026-08-16
- 모드: 적용(application)
- 기하 원천: `makeup-dense-atlas-v3`, MediaPipe FaceMesh 478점 fixture
- 참조 이미지: `C:\Users\user\.codex\generated_images\019fe9bd-00a6-7d93-8d35-260a9790c2ad\exec-960053d4-0d25-4baa-9a56-c38e1a77b502.png`
- 참조 SHA-256: `8f547eeb3a78fe7f7636c21769e554961666e8aa7903ffdbc6df0bdb514b5691`

## 판정

콜아웃 연결점과 아이라인·속눈썹 국소 가이드는 정밀 아틀라스의 실제 얼굴 좌표에서 파생한다. 478점 원시 메시와 precision tick은 진단용 정밀 모드에서만 보이고, 고객 기본 화면에는 분리된 9개 컬러 칩과 두 종류의 눈매 국소 가이드만 보인다.
색상 상세 카드와 기술 방향 매트릭스도 진단용 fixture에만 남기고 고객 화면에서는 제거한다.

| 항목 | 판정 | 근거 |
|---|---|---|
| 9개 부위 | 통과 | 아이섀도·아이라인·속눈썹을 독립 칩으로 분리하고, 얼굴 위 전체 랜드마크 없이 각 연결선이 precision atlas v3 앵커로 해당 부위를 직접 지시 |
| 콜아웃 | 통과 | 좌측 4개·우측 3개, 중복 0, precision atlas 최근접 점에 연결 |
| 고객 상세 패널 | 통과 | 색상 상세 카드와 기술 매트릭스를 고객 화면에서 제거하고 진단 fixture에만 유지 |
| 금지 도형 | 통과 | circle·ellipse·polygon·marker·닫힌 Z path 0개 |

참조 대비 고심각도 차이 0건, 중간 심각도 차이 0건이다. 낮은 심각도 차이는 제품 UI 글꼴과 컨테이너별 사진 crop뿐이며 컬러칩 위치·눈매 국소 가이드·사용 의미에는 영향을 주지 않는다.

## 반응형 증거

| 뷰포트 | 증거 | 결과 |
|---:|---|---|
| 1440px | `docs/hairfit-v2/evidence/p06-makeup-zone-direction-desktop.png` | overflow 0, 콜아웃 중첩 0, 고객 상세 카드·기술표 0 |
| 768px | `docs/hairfit-v2/evidence/p08-makeup-tablet-accessibility.png` | overflow 0, 콜아웃 중첩 0, 고객 상세 카드·기술표 0 |
| 390px | `docs/hairfit-v2/evidence/p09-makeup-mobile-accessibility.png` | overflow 0, 콜아웃 중첩 0, 컬러칩 키보드 조작 통과 |

## 자동 검증 계약

- 적용 모드 얼굴 위 atlas·semantic·application guide·landmark tick 0개
- 고유 존 9개, 커넥터 9개, 아이섀도·아이라인·속눈썹 칩 경계 비중첩
- 적용 모드 raw atlas line 0개
- 구조 모드 14개, 정밀 모드 46개 atlas line
- 구조·정밀 진단 모드에서만 atlas line과 precision tick 유지
- 키보드·touch 선택, reduced-motion, axe serious/critical 위반 0
- 390/768/1440 컴포넌트 실측 폭이 viewport를 넘지 않음

## 증거 경계

이 판정은 저장소의 세미리얼 모델과 합성 478점 fixture를 사용한 로컬 Web 검증이다. 실제 고객 사진, 실제 vision provider 편차, 물리 기기 GPU 렌더링, 운영 지연·비용은 증명하지 않는다.
