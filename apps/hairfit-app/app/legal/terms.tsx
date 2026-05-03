import { BodyText, Card, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";

const sections = [
  {
    title: "1. 약관 동의",
    items: [
      "HairFit 서비스를 이용하면 본 약관에 동의한 것으로 봅니다.",
      "약관에 동의하지 않는 경우 서비스 이용을 중단해야 합니다.",
    ],
  },
  {
    title: "2. 서비스 설명",
    items: [
      "HairFit은 사용자가 제공한 이미지를 바탕으로 AI 헤어스타일 미리보기와 스타일 추천을 제공합니다.",
      "생성 결과는 시각 참고용이며 실제 시술 결과와 다를 수 있습니다.",
    ],
  },
  {
    title: "3. 사용자 콘텐츠",
    items: [
      "사용자는 업로드한 이미지와 입력한 정보에 필요한 권리를 보유해야 합니다.",
      "불법, 유해, 타인의 권리를 침해하는 콘텐츠 업로드는 금지됩니다.",
    ],
  },
  {
    title: "4. 결제와 환불",
    items: [
      "유료 플랜과 크레딧은 결제 화면에 표시된 조건에 따릅니다.",
      "환불은 관련 법령과 회사의 환불 정책에 따라 검토됩니다.",
    ],
  },
  {
    title: "5. AI 생성물 면책",
    items: [
      "AI 생성물에는 부정확하거나 기술적 한계로 인한 결함이 포함될 수 있습니다.",
      "의료, 법률, 전문 의사결정의 근거로 사용해서는 안 됩니다.",
    ],
  },
];

export default function TermsScreen() {
  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Legal</Kicker>
          <Heading>이용 약관</Heading>
          <BodyText>최종 수정일: 2026-02-12</BodyText>
        </Stack>
      </Panel>

      <Card>
        <BodyText>
          본 이용 약관은 HairFit 서비스의 이용 조건과 회사와 사용자 간의 권리 및 의무를 정합니다.
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
