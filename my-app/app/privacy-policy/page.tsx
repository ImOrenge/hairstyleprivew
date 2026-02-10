const sections = [
  {
    title: "1. 수집하는 개인정보 항목",
    items: [
      "회원가입/로그인 정보: 이메일, 외부 인증 식별자(Clerk user ID)",
      "서비스 이용 정보: 생성 요청 프롬프트, 생성 결과 메타데이터, 접속 로그",
      "결제 관련 정보(선택): 결제 상태 및 결제 식별자(민감 결제정보 원문은 보관하지 않음)",
    ],
  },
  {
    title: "2. 개인정보 이용 목적",
    items: [
      "AI 헤어스타일 생성 서비스 제공 및 품질 개선",
      "회원 식별, 계정 보안 유지, 부정 사용 방지",
      "결제 처리 및 이용권/크레딧 관리",
      "고객 문의 대응 및 분쟁 처리",
    ],
  },
  {
    title: "3. 보관 및 파기",
    items: [
      "계정 정보는 회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에 따라 보존이 필요한 정보는 해당 기간 동안 보관합니다.",
      "서비스 로그 및 운영 기록은 보안 및 장애 대응 목적으로 일정 기간 보관 후 파기합니다.",
    ],
  },
  {
    title: "4. 제3자 제공 및 처리 위탁",
    items: [
      "서비스 운영을 위해 다음 외부 서비스를 이용할 수 있습니다: Clerk(인증), Supabase(DB), Google Gemini(AI 처리), Polar(결제).",
      "법령상 요구가 있는 경우를 제외하고, 이용자 동의 없이 개인정보를 제3자에게 판매하지 않습니다.",
    ],
  },
  {
    title: "5. 이용자 권리",
    items: [
      "이용자는 언제든지 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.",
      "요청은 고객 지원 채널 또는 등록된 문의 수단을 통해 접수할 수 있습니다.",
    ],
  },
  {
    title: "6. 쿠키 및 유사 기술",
    items: [
      "로그인 유지, 보안, 서비스 성능 분석을 위해 쿠키 또는 유사 기술을 사용할 수 있습니다.",
      "브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나 일부 기능 이용이 제한될 수 있습니다.",
    ],
  },
  {
    title: "7. 정책 변경",
    items: [
      "관련 법령 또는 서비스 변경에 따라 본 방침은 수정될 수 있습니다.",
      "중요 변경 시 서비스 내 공지 또는 별도 고지를 통해 안내합니다.",
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Legal</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">Privacy Policy</h1>
        <p className="text-sm text-stone-600">최종 업데이트: 2026-02-10</p>
      </header>

      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700 sm:p-6">
        <p>
          StyleMirror(이하 &ldquo;회사&rdquo;)는 이용자의 개인정보를 중요하게 생각하며, 관련 법령을 준수합니다.
          본 개인정보 처리방침은 회사가 어떤 정보를 수집하고 어떻게 이용/보관/보호하는지 안내합니다.
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
