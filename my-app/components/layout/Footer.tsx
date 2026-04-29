"use client";

import Link from "next/link";
import { useT } from "../../lib/i18n/useT";

export function Footer() {
  const t = useT();

  return (
    <footer className="border-t border-[var(--app-border)] bg-[var(--app-surface)] transition-colors">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-2 px-2 py-4 text-sm text-[var(--app-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-3">
        <p>&copy; {new Date().getFullYear()} HairFit</p>
        <div className="flex items-center gap-3">
          <Link href="/privacy-policy" className="underline-offset-4 hover:underline">
            {t("footer.privacy")}
          </Link>
          <Link href="/terms-of-service" className="underline-offset-4 hover:underline">
            {t("footer.terms")}
          </Link>
          <p>{t("footer.builtWith")}</p>
        </div>
      </div>
    </footer>
  );
}
