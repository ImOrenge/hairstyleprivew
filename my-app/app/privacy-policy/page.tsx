const sections = [
  {
    title: "1. Data We Collect",
    items: [
      "Account data: email and external auth identifier (Clerk user ID).",
      "Service usage data: prompt requests, generation metadata, and access logs.",
      "Payment status data (optional): payment state and transaction identifiers.",
    ],
  },
  {
    title: "2. Why We Use Data",
    items: [
      "To provide and improve the HairFit AI hairstyle preview service.",
      "To identify users, secure accounts, and prevent abuse.",
      "To process payments and manage credits.",
      "To respond to support requests and resolve disputes.",
    ],
  },
  {
    title: "3. Retention and Deletion",
    items: [
      "Account data is deleted after account closure unless retention is required by law.",
      "Operational logs are retained for security and reliability for a limited period.",
    ],
  },
  {
    title: "4. Third-Party Services",
    items: [
      "HairFit may use Clerk (auth), Supabase (database), Google Gemini (AI), and Polar (payments).",
      "We do not sell personal data to third parties.",
    ],
  },
  {
    title: "5. Your Rights",
    items: [
      "You may request access, correction, deletion, or restriction of your personal data.",
      "Requests can be submitted through our support channel.",
    ],
  },
  {
    title: "6. Cookies and Similar Technologies",
    items: [
      "We may use cookies for login session management, security, and performance analysis.",
      "Disabling cookies may limit parts of the service.",
    ],
  },
  {
    title: "7. Policy Changes",
    items: [
      "This policy may be updated for legal or service changes.",
      "Major updates will be announced in the service.",
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Legal</p>
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">Privacy Policy</h1>
        <p className="text-sm text-stone-600">Last updated: 2026-02-10</p>
      </header>

      <section className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700 sm:p-6">
        <p>
          HairFit (&quot;Company&quot;) values your privacy and handles personal data in accordance with applicable laws.
          This policy explains what we collect, why we use it, and how we protect it.
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
