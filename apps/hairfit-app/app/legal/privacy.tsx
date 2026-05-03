import { BodyText, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";

const sections = [
  {
    title: "1. 수집하는 개인정보",
    items: [
      "계정 데이터: 이메일 주소, 이름, 인증 식별자.",
      "서비스 이용 데이터: 업로드 이미지, 프롬프트 요청 이력, 생성 결과, 선택한 스타일.",
      "결제 데이터: 결제 상태, 거래 식별자, 플랜 및 크레딧 지급 이력.",
    ],
  },
  {
    title: "2. 이용 목적",
    items: [
      "AI 헤어스타일 미리보기, 패션 추천, 에프터케어 가이드 제공.",
      "계정 보안, 부정 이용 방지, 서비스 품질 개선.",
      "결제 처리, 환불 확인, 고객 지원.",
    ],
  },
  {
    title: "3. 보관 및 파기",
    items: [
      "계정 데이터는 회원 탈퇴 또는 법령상 보관 기간 종료 시 파기합니다.",
      "운영 로그는 보안과 안정성 확인을 위해 필요한 기간 동안만 보관합니다.",
    ],
  },
  {
    title: "4. 외부 서비스",
    items: [
      "HairFit은 인증, 데이터베이스, AI 생성, 결제를 위해 Clerk, Supabase, Google Gemini, PortOne을 사용합니다.",
      "서비스 제공에 필요한 범위를 넘어 개인정보를 판매하거나 무단 공유하지 않습니다.",
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Legal</Kicker>
          <Heading>개인정보 처리방침</Heading>
          <BodyText>최종 수정일: 2026-02-12</BodyText>
        </Stack>
      </Panel>

      <Card>
        <BodyText>
          HairFit은 이용자의 개인정보를 소중하게 다루며, 관련 법령을 준수하기 위해 개인정보의 수집,
          이용, 보관, 파기 기준을 안내합니다.
        </BodyText>
      </Card>

      {sections.map((section) => (
        <Card key={section.title}>
          <Stack>
            <Heading>{section.title}</Heading>
            {section.items.map((item) => (
              <BodyText key={item}>- {item}</BodyText>
            ))}
          </Stack>
        </Card>
      ))}
    </Screen>
  );
}
