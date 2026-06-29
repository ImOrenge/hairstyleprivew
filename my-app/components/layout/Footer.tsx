"use client";

import Link from "next/link";
import { footerBusinessInfo } from "../../lib/business-info";
import { useT } from "../../lib/i18n/useT";

export function Footer() {
  const t = useT();

  return (
    <footer className="border-t border-[var(--app-border)] bg-[var(--app-surface)] transition-colors">
      <div className="mx-auto grid w-full max-w-[82rem] gap-4 px-3 py-5 text-sm text-[var(--app-muted)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} HairFit</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/privacy-policy" className="underline-offset-4 hover:underline">
              {t("footer.privacy")}
            </Link>
            <Link href="/terms-of-service" className="underline-offset-4 hover:underline">
              {t("footer.terms")}
            </Link>
            <Link href="/support" className="underline-offset-4 hover:underline">
              고객지원
            </Link>
            <Link
              href="/b2b/signup"
              className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
            >
              B2B 가입
            </Link>
            <p>{t("footer.builtWith")}</p>
          </div>
        </div>

        <div className="border-t border-[var(--app-border)] pt-4 text-xs leading-5">
          <p className="font-black text-[var(--app-text)]">{footerBusinessInfo.heading}</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {footerBusinessInfo.rows.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-wrap gap-x-1.5">
                <dt className="font-bold text-[var(--app-subtle)]">{item.label}</dt>
                <dd className="min-w-0 break-words">
                  {item.href ? (
                    <a href={item.href} className="underline-offset-4 hover:underline">
                      {item.value}
                    </a>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </footer>
  );
}
