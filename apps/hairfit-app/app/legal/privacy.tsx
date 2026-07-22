import {
  ACCOUNT_DELETION_DISCLOSURE,
  GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO,
  NOTIFICATION_RETENTION_DISCLOSURE_KO,
} from "@hairfit/shared";
import { BodyText, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { AppScreen } from "../../components/app/AppScreen";

const sections = [
  {
    title: "1. 수집하는 개인정보",
    items: [
      "계정 데이터: 이메일 주소, 이름, 인증 식별자.",
      "서비스 이용 데이터: 업로드 이미지, 프롬프트 요청 이력, 생성 결과, 선택한 스타일.",
      "결제 데이터: 결제 상태, 거래 식별자, 플랜 및 크레딧 지급 이력.",
      "앱 완료 알림 데이터(선택): 기기 설치 식별자, Expo·운영체제 Push 토큰, 플랫폼, 앱 버전, 알림 동의·해제·오류 상태.",
    ],
  },
  {
    title: "2. 이용 목적",
    items: [
      "AI 헤어스타일 미리보기, 패션 추천, 에프터케어 가이드 제공.",
      "계정 보안, 부정 이용 방지, 서비스 품질 개선.",
      "결제 처리, 환불 확인, 고객 지원.",
      "사용자가 알림을 켠 경우 헤어 생성 완료·부분 완료·실패 안내와 결과 화면 재진입.",
    ],
  },
  {
    title: "3. 보관 및 파기",
    items: [
      "계정 데이터는 회원 탈퇴 또는 법령상 보관 기간 종료 시 파기합니다.",
      "운영 로그는 보안과 안정성 확인을 위해 필요한 기간 동안만 보관합니다.",
      "알림을 끄거나 로그아웃하면 기기 토큰 연결을 해제하고, 만료 토큰은 발송 영수증 확인 후 비활성화합니다. 회원 탈퇴 시 연결된 토큰을 삭제합니다.",
      ACCOUNT_DELETION_DISCLOSURE,
      "탈퇴 재시도와 중복 삭제 방지를 위한 복원 불가능한 사용자 식별자 해시와 삭제 영수증은 30일 동안 보관한 뒤 자동 파기합니다.",
      ...GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO,
      ...NOTIFICATION_RETENTION_DISCLOSURE_KO,
    ],
  },
  {
    title: "4. 외부 서비스",
    items: [
      "HairFit은 인증, 데이터베이스, AI 생성, 결제와 선택 앱 알림을 위해 Clerk, Supabase, Google Gemini, PortOne, Expo Push Service, Apple APNs, Google FCM을 사용합니다.",
      "서비스 제공에 필요한 범위를 넘어 개인정보를 판매하거나 무단 공유하지 않습니다.",
      "알림 권한을 거부하거나 끄더라도 이메일과 앱 내 작업 현황으로 생성 완료를 계속 확인할 수 있습니다.",
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>법적 고지</Kicker>
          <Heading>개인정보 처리방침</Heading>
          <BodyText>최종 수정일: 2026-07-18</BodyText>
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
    </AppScreen>
  );
}
