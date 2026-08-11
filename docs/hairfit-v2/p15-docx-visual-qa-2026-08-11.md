# P15 원본 프론트 요구서 Word 렌더링 QA

- 검증일: 2026-08-11 KST
- 원본: `D:/HariStyle-Preview/docs/HairFit_V2_Product_Refactor_Phase_Package_2026-08-07/HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx`
- SHA-256: `36EC61DC75F17DFB2C3F68A169EEBE2999DCE4CCFC1763A1744095CF78105091`
- 크기: `811,942 bytes`
- 렌더러: Microsoft Word, 호환 모드, 100% 확대
- 페이지 수: 52
- 판정: `pass`

## 검증 방법

1. Protected View의 원본을 Microsoft Word 편집 보기로 전환하되 저장하지 않았다.
2. Word의 실제 창 렌더링을 페이지·페이지 경계별 52장으로 캡처했다.
3. 1~13, 14~26, 27~39, 40~52페이지의 4개 contact sheet로 전체 흐름을 확인했다.
4. 페이지 5, 14, 22, 40, 51, 52와 마지막 페이지 하단을 원본 해상도로 확대 확인했다.
5. 검증 뒤 HairFit 문서만 `saveChanges = false`로 닫고, 함께 열려 있던 다른 Word 문서는 유지했다.

임시 렌더링 증거는 `C:/Users/user/AppData/Local/Temp/hairfit-word-pages-20260811-160045`에 생성했다. 저장소 산출물이 아니므로 배포 패키지에는 포함하지 않는다.

## 확인 결과

- 표, 다이어그램, 코드 블록, 캡션과 페이지 푸터가 문서 경계 안에 렌더링된다.
- 육안으로 확인 가능한 텍스트 잘림, 객체 겹침, 깨진 표, 누락된 페이지, 대체 폰트로 인한 구조 붕괴가 없다.
- 표지 뒤 큰 여백과 페이지 경계에서 보이는 다음 페이지 일부는 Word 연속 페이지 보기의 결과이며 내용 손실이 아니다.
- 마지막 52페이지의 출시 체크리스트와 최종 판단 박스가 모두 표시되고 하단 푸터까지 정상이다.

## 제한과 실패 기록

- Word `ExportAsFixedFormat` PDF 변환은 120초 안에 완료되지 않아 증거로 사용하지 않았다.
- PDF 변환 실패를 렌더링 통과로 간주하지 않았다. 판정은 Word 자체가 실제로 그린 52페이지 창 캡처에 근거한다.
- 이 검증은 원본 요구서의 시각적 무결성을 증명하며, 현재 구현 화면의 실인증·실기기 품질을 대신하지 않는다.
