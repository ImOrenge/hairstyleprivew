"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminSectionNavProps {
  links: Array<{
    href: string;
    label: string;
  }>;
  variant: "rail" | "tabs";
}

export function AdminSectionNav({ links, variant }: AdminSectionNavProps) {
  const pathname = usePathname();

  if (variant === "rail") {
    return (
      <nav className="mt-4 grid gap-1.5">
        {links.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[var(--app-radius-control)] border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                  : "border-transparent text-[var(--app-text)] hover:border-[var(--app-border)] hover:bg-[var(--app-surface-muted)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-[3.6rem] z-20 -mx-2 mb-3 flex gap-2 overflow-x-auto border-y border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
    >
      {links.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border px-4 text-sm font-black transition ${
              active
                ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
