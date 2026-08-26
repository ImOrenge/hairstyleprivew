import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";
import { SUBSCRIPTION_BILLING_POLICY_KO } from "@hairfit/shared";

const webSubscriptionBillingPolicy = SUBSCRIPTION_BILLING_POLICY_KO
  .filter((item) => item.id !== "unusedCredits")
  .map((item) =>
    item.id === "creditGrant"
      ? {
          ...item,
          title: "월 이용권 등록",
          description: "월 이용권은 카드 승인과 HairFit의 결제 확인이 모두 끝난 뒤 계정에 등록됩니다.",
        }
      : item,
  );

const sections = [
  {
    title: "1. 약관의 동의",
    items: [
      "HairFit 서비스를 이용함으로써 귀하는 본 이용 약관에 동의하게 됩니다.",
      "약관에 동의하지 않으실 경우 서비스 이용을 중단해야 합니다.",
    ],
  },
  {
    title: "2. 계정 및 자격 요건",
    items: [
      "귀하는 정확한 계정 정보를 제공해야 하며, 본인의 계정 정보를 안전하게 관리할 책임이 있습니다.",
      "계정에서 발생하는 모든 활동에 대한 책임은 귀하에게 있으며, 무단 이용 발견 시 즉시 회사에 알려야 합니다.",
    ],
  },
  {
    title: "3. 서비스의 설명",
    items: [
      "HairFit은 사용자가 제공한 이미지와 프롬프트를 바탕으로 AI 기술을 활용한 헤어스타일 미리보기 기능을 제공합니다.",
      "생성된 결과물은 시각적 참고용이며, 실제 결과와 차이가 있을 수 있습니다.",
    ],
  },
  {
    title: "4. 사용자 콘텐츠 및 권리",
    items: [
      "귀하가 서비스에 업로드한 이미지 및 텍스트에 대한 소유권은 귀하에게 있습니다.",
      "귀하는 HairFit이 서비스 운영, 보안 유지 및 기능 개선을 위해 필요한 범위 내에서 귀하의 콘텐츠를 처리할 수 있는 제한적인 라이선스를 부여합니다.",
      "업로드하는 콘텐츠에 대해 필요한 모든 권리 및 권한을 보유하고 있음을 보증해야 합니다.",
    ],
  },
  {
    title: "5. 이용자 준수사항",
    items: [
      "불법적, 유해적, 모욕적, 타인의 권리를 침해하거나 기만적인 콘텐츠를 업로드할 수 없습니다.",
      "서비스의 보안 체계를 우회, 침투하거나 역설계(Reverse Engineering)를 시도해서는 안 됩니다.",
      "불법적인 감시, 사칭 또는 사기 목적으로 서비스를 이용할 수 없습니다.",
    ],
  },
  {
    title: "6. AI 생성물에 대한 면책",
    items: [
      "AI가 생성한 결과물은 부정확하거나 기술적 한계로 인한 결함이 포함될 수 있습니다.",
      "생성된 결과물의 사용 여부 및 그 결과에 대한 책임은 전적으로 사용자에게 있습니다.",
      "생성물은 의료, 법률 또는 전문적인 의사결정의 근거로 사용하기에 적합하지 않을 수 있습니다.",
    ],
  },
  {
    title: "7. 결제, 이용권 및 환불",
    items: [
      ...webSubscriptionBillingPolicy.map((item) => `${item.title}: ${item.description}`),
      "풀 스타일 상품은 계약 내용을 확인할 수 있는 문서를 받은 날부터 법정 청약철회 기간인 7일 이내에 환불을 신청할 수 있습니다. 서비스 제공이 그보다 늦게 시작되면 법령에 따라 서비스 제공 시작일을 기준으로 다시 계산될 수 있습니다.",
      "법정 청약철회 기한이 지나면 상담을 시작하지 않았더라도 단순 변심에 따른 환불은 제공되지 않습니다.",
      "유료 3×3 생성 또는 무료 데모 결제 후 비교 계속하기를 실행하면 해당 상담 회차가 시작됩니다. 시작된 회차는 7일 이내라도 단순 변심 환불이 제한될 수 있습니다.",
      "Signature Style Membership은 청약철회 기간 안에 시작하지 않은 회차를 결제 당시 총액의 회차별 금액으로 계산합니다. 현재 412,800원 상품은 회차당 103,200원입니다.",
      "중복·오결제·과오납, 승인하지 않은 결제, HairFit 책임의 결과 미제공, 표시·광고·계약과 중요한 부분이 다른 서비스, 개인정보 또는 안전 문제는 일반 단순 변심과 구분하여 별도로 심사합니다.",
      "HairFit 책임의 장애는 무상 복구 또는 이용 권리 복원을 먼저 제안하며, 복구가 실패하거나 고객이 원하지 않으면 해당 회차 환불을 검토합니다.",
      "정상 결과 제공 후 취향 차이, 단순 불만족 또는 고객의 중도 이탈은 예외 환불 사유에 포함되지 않습니다.",
      "정기상품의 기간말 해지는 환불과 별도로 다음 결제를 중지하며 현재 계약의 이용 권리는 기간 종료일까지 유지됩니다.",
    ],
  },
  {
    title: "8. 지식재산권",
    items: [
      "HairFit 서비스의 브랜드, 소프트웨어 및 디자인 등 모든 자산은 관련 지식재산권 법의 보호를 받습니다.",
      "회사의 명시적 허가 없이 서비스 자산을 복제, 수정, 배포 또는 상업적으로 이용할 수 없습니다.",
    ],
  },
  {
    title: "9. 이용 제한 및 계약 해지",
    items: [
      "회사는 약관 위반 또는 이용자 보호를 위해 서비스 이용을 일시 정지하거나 영구적으로 제한할 수 있습니다.",
      "이용자는 언제든지 서비스 이용을 중단하고 계정 삭제를 요청할 수 있습니다.",
    ],
  },
  {
    title: "10. 보증의 부인 및 책임의 제한",
    items: [
      "서비스는 현재 상태(As-Is)로 제공되며, 무중단 운영 등을 보증하지 않습니다.",
      "법령이 허용하는 최대 범위 내에서 회사는 간접적, 우발적 또는 결과적 손해에 대해 책임을 지지 않습니다.",
    ],
  },
  {
    title: "11. 약관의 변경",
    items: [
      "회사는 법령의 변경이나 서비스의 업데이트를 반영하기 위해 본 약관을 개정할 수 있습니다.",
      "중요한 약관 변경 시 서비스 내 공지 또는 기타 합리적인 방법으로 통지합니다.",
    ],
  },
  {
    title: "12. 고객 지원 및 연락처",
    items: [
      "본 약관에 관한 문의는 HairFit 공식 고객 지원 채널을 통해 접수해 주시기 바랍니다.",
    ],
  },
] as const;

export default function TermsOfServicePage() {
  return (
    <AppPage className="max-w-4xl pb-16 pt-8">
      <Panel as="header" className="p-5 sm:p-6">
        <p className="app-kicker">법적 고지</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
          이용 약관
        </h1>
        <p className="mt-2 text-sm text-[var(--app-muted)]">최종 수정일: 2026-08-25</p>
      </Panel>

      <SurfaceCard as="section" className="mt-5 space-y-3 p-5 text-sm leading-6 text-[var(--app-muted)] sm:p-6">
        <p>
          본 이용 약관(&quot;약관&quot;)은 HairFit(&quot;서비스&quot;)의 이용 조건과 귀하와 회사 간의 권리 및 의무를 규정합니다.
          서비스를 이용함으로써 귀하는 본 약관에 동의하는 것으로 간주됩니다.
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
