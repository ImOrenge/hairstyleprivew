const sections = [
  {
    title: "1. 수집하는 개인정보 항목",
    items: [
      "계정 데이터: 이메일 주소 및 외부 인증 식별자 (Clerk 사용자 ID).",
      "서비스 이용 데이터: 프롬프트 요청 내역, 생성 메타데이터 및 접속 로그.",
      "결제 상태 데이터 (선택): 결제 상태 및 트랜잭션 식별자.",
    ],
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    items: [
      "HairFit AI 헤어스타일 미리보기 서비스 제공 및 기능 개선.",
      "이용자 식별, 계정 보안 유지 및 부정 이용 방지.",
      "결제 처리 및 크레딧 관리.",
      "고객 문의 응대 및 분쟁 해결.",
    ],
  },
  {
    title: "3. 개인정보의 보유 및 파기",
    items: [
      "계정 데이터는 회원 탈퇴 시 지체 없이 파기하되, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.",
      "운영 로그는 보안 및 서비스 안정성을 위해 일정 기간 동안만 보유 후 파기합니다.",
    ],
  },
  {
    title: "4. 제3자 서비스 및 데이터 제공",
    items: [
      "HairFit은 서비스 운영을 위해 Clerk (인증), Supabase (데이터베이스), Google Gemini (AI), Polar (결제) 서비스를 이용할 수 있습니다.",
      "이용자의 개인정보를 제3자에게 판매하거나 무단으로 공유하지 않습니다.",
    ],
  },
  {
    title: "5. 이용자의 권리",
    items: [
      "이용자는 본인의 개인정보에 대한 열람, 정정, 삭제 및 처리 정지를 요청할 수 있습니다.",
      "요청 사항은 고객 지원 채널을 통해 접수할 수 있습니다.",
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
    <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Legal</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">개인정보 처리방침</h1>
        <p className="text-sm text-stone-600">최종 수정일: 2026-02-12</p>
      </header>

      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700 sm:p-6">
        <p>
          HairFit(&quot;회사&quot;)은 이용자의 개인정보를 소중히 여기며, 관련 법령을 준수하기 위해 최선을 다하고 있습니다.
          본 방침은 회사가 어떤 정보를 수집하고, 어떻게 활용하며, 어떻게 보호하는지에 대해 설명합니다.
        </p>
      </section>

      <div className="mt-5 space-y-4">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700 sm:p-6"
          >
            <h2 className="text-base font-bold text-stone-900">{section.title}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

