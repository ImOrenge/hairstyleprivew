import {
  ACCOUNT_DELETION_DISCLOSURE,
  GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO,
  NOTIFICATION_RETENTION_DISCLOSURE_KO,
} from "@hairfit/shared";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";

const sections = [
  {
    title: "1. 수집하는 개인정보 항목",
    items: [
      "계정 데이터: 이메일 주소 및 외부 인증 식별자 (Clerk 사용자 ID).",
      "서비스 이용 데이터: 프롬프트 요청 내역, 생성 메타데이터 및 접속 로그.",
      "살롱 연결 데이터 (선택): 연결 동의 버전·시각·범위, 연결/해제 상태, 초대 재발급 및 해제 감사 기록.",
      "결제 상태 데이터 (선택): 결제 상태 및 트랜잭션 식별자.",
      "앱 완료 알림 데이터 (선택): 기기 설치 식별자, Expo·운영체제 Push 토큰, 플랫폼, 앱 버전, 알림 동의·해제·오류 상태.",
    ],
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    items: [
      "HairFit AI 헤어스타일 미리보기 서비스 제공 및 기능 개선.",
      "이용자 식별, 계정 보안 유지 및 부정 이용 방지.",
      "결제 처리 및 서비스 이용량 관리.",
      "고객 문의 응대 및 분쟁 해결.",
      "이용자가 앱 완료 알림을 켠 경우 헤어 생성 완료·부분 완료·실패 안내와 정확한 결과 재진입 제공.",
      "이용자가 명시적으로 동의한 경우 제휴 살롱의 상담 준비, 스타일 제안 및 방문 기록 관리.",
    ],
  },
  {
    title: "3. 개인정보의 보유 및 파기",
    items: [
      "계정 데이터는 회원 탈퇴 시 지체 없이 파기하되, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.",
      "운영 로그는 보안 및 서비스 안정성을 위해 일정 기간 동안만 보유 후 파기합니다.",
      "살롱 연결을 해제하면 해당 살롱의 회원 프로필 및 HairFit 생성·확정 기록 조회 권한을 즉시 차단합니다.",
      "살롱이 직접 작성한 방문·상담·관리 기록은 고객 관리 및 분쟁 대응을 위해 일반 고객 기록으로 보관될 수 있으며, 이용자는 살롱 또는 HairFit 지원 채널에 삭제를 요청할 수 있습니다.",
      "앱 완료 알림을 끄거나 로그아웃하면 해당 기기 토큰 연결을 해제합니다. 운영체제가 만료 토큰을 알리면 즉시 비활성화하며, 회원 탈퇴 시 사용자와 연결된 토큰을 삭제합니다.",
      ACCOUNT_DELETION_DISCLOSURE,
      "탈퇴 재시도와 중복 삭제 방지를 위한 복원 불가능한 사용자 식별자 해시와 삭제 영수증은 30일 동안 보관한 뒤 자동 파기합니다.",
      ...GENERATION_ORIGINAL_RETENTION_DISCLOSURE_KO,
      ...NOTIFICATION_RETENTION_DISCLOSURE_KO,
    ],
  },
  {
    title: "4. 제3자 서비스 및 데이터 제공",
    items: [
      "HairFit은 서비스 운영을 위해 Clerk (인증), Supabase (데이터베이스), Google Gemini (AI), PortOne (결제), Expo Push Service 및 Apple APNs·Google FCM (선택 앱 알림) 서비스를 이용할 수 있습니다.",
      "이용자의 개인정보를 제3자에게 판매하거나 무단으로 공유하지 않습니다.",
      "살롱 연결 동의 시 닉네임·아바타·이메일, 최근 생성 기록과 선택 스타일, 확정 헤어 기록만 초대한 살롱에 제공합니다. 결제 정보, 비밀번호, 개인 사진 원본 및 개인 애프터케어 가이드 원문은 제공하지 않습니다.",
    ],
  },
  {
    title: "5. 이용자의 권리",
    items: [
      "이용자는 본인의 개인정보에 대한 열람, 정정, 삭제 및 처리 정지를 요청할 수 있습니다.",
      "요청 사항은 고객 지원 채널을 통해 접수할 수 있습니다.",
      "이용자는 마이페이지의 살롱 연결 관리에서 언제든 연결 동의를 철회할 수 있으며, 철회해도 일반 HairFit 기능 이용은 제한되지 않습니다.",
      "이용자는 앱 계정 화면과 운영체제 설정에서 완료 알림을 언제든 끌 수 있으며, 거부해도 이메일과 앱 내 작업 현황을 계속 이용할 수 있습니다.",
      "이용자는 마이페이지 계정 탭에서 회원 탈퇴를 직접 요청할 수 있습니다.",
    ],
  },
  {
    title: "6. 쿠키 및 유사 기술의 사용",
    items: [
      "로그인 세션 관리, 보안성 강화 및 성능 분석을 위해 쿠키를 사용할 수 있습니다.",
      "쿠키 사용을 거부할 경우 서비스의 일부 기능 이용이 제한될 수 있습니다.",
    ],
  },
  {
    title: "7. 개인정보 처리방침의 변경",
    items: [
      "본 방침은 법령 또는 서비스 변경에 따라 업데이트될 수 있습니다.",
      "중요한 변경 사항은 서비스 내 공지사항을 통해 안내합니다.",
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <AppPage className="max-w-4xl pb-16 pt-8">
      <Panel as="header" className="p-5 sm:p-6">
        <p className="app-kicker">법적 고지</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          개인정보 처리방침
        </h1>
        <p className="mt-2 text-sm text-[var(--app-muted)]">최종 수정일: 2026-07-18</p>
      </Panel>

      <SurfaceCard as="section" className="mt-5 space-y-3 p-5 text-sm leading-6 text-[var(--app-muted)] sm:p-6">
        <p>
          HairFit(&quot;회사&quot;)은 이용자의 개인정보를 소중히 여기며, 관련 법령을 준수하기 위해 최선을 다하고 있습니다.
          본 방침은 회사가 어떤 정보를 수집하고, 어떻게 활용하며, 어떻게 보호하는지에 대해 설명합니다.
        </p>
      </SurfaceCard>

      <div className="mt-5 space-y-4">
        {sections.map((section) => (
          <SurfaceCard
            as="section"
            key={section.title}
            className="p-5 text-sm leading-6 text-[var(--app-muted)] sm:p-6"
          >
            <h2 className="text-base font-bold text-[var(--app-text)]">{section.title}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SurfaceCard>
        ))}
      </div>
    </AppPage>
  );
}
