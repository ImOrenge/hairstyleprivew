const sections = [
  {
    title: "1. Acceptance of Terms",
    items: [
      "By accessing or using HairFit, you agree to be bound by these Terms of Service.",
      "If you do not agree with these terms, you must stop using the service.",
    ],
  },
  {
    title: "2. Eligibility and Accounts",
    items: [
      "You must provide accurate account information and keep your credentials secure.",
      "You are responsible for all activity under your account unless unauthorized access is reported promptly.",
    ],
  },
  {
    title: "3. Service Description",
    items: [
      "HairFit provides AI-assisted hairstyle preview features based on user-provided images and prompts.",
      "Generated results are for visualization purposes only and may not match final real-world outcomes.",
    ],
  },
  {
    title: "4. User Content and Rights",
    items: [
      "You retain ownership of images and text you upload to the service.",
      "You grant HairFit a limited license to process your content solely to operate, secure, and improve the service.",
      "You must have all necessary rights and permissions for uploaded content.",
    ],
  },
  {
    title: "5. Acceptable Use",
    items: [
      "You may not upload illegal, harmful, abusive, infringing, or deceptive content.",
      "You may not attempt to disrupt, probe, reverse engineer, or bypass service security controls.",
      "You may not use the service for unlawful surveillance, impersonation, or fraud.",
    ],
  },
  {
    title: "6. AI Output Disclaimer",
    items: [
      "AI-generated outputs can contain inaccuracies, artifacts, or unexpected results.",
      "You are solely responsible for reviewing and deciding how to use generated content.",
      "HairFit does not guarantee suitability for medical, legal, or professional decision-making.",
    ],
  },
  {
    title: "7. Payments, Credits, and Refunds",
    items: [
      "Paid plans and credit usage are governed by the billing terms presented at checkout.",
      "Credits may expire or be adjusted according to plan policies announced in the service.",
      "Refund requests are reviewed according to applicable law and published payment policy.",
    ],
  },
  {
    title: "8. Intellectual Property",
    items: [
      "The HairFit service, branding, software, and design are protected by intellectual property laws.",
      "Except as expressly permitted, you may not copy, modify, distribute, or commercially exploit service assets.",
    ],
  },
  {
    title: "9. Suspension and Termination",
    items: [
      "HairFit may suspend or terminate access for violations of these terms or to protect users and infrastructure.",
      "You may stop using the service at any time and request account deletion where applicable.",
    ],
  },
  {
    title: "10. Warranties and Liability",
    items: [
      "The service is provided \"as is\" and \"as available\" without warranties of uninterrupted operation.",
      "To the maximum extent permitted by law, HairFit is not liable for indirect, incidental, or consequential damages.",
    ],
  },
  {
    title: "11. Changes to These Terms",
    items: [
      "We may update these terms to reflect legal, security, or service changes.",
      "Material changes will be communicated in the service or through other reasonable notice.",
    ],
  },
  {
    title: "12. Contact",
    items: [
      "For questions about these terms, contact support through the official HairFit support channel.",
    ],
  },
] as const;

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Legal</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">Terms of Service</h1>
        <p className="text-sm text-stone-600">Last updated: 2026-02-11</p>
      </header>

      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700 sm:p-6">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of HairFit (&quot;Service&quot;). By
          using the Service, you agree to these Terms.
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
