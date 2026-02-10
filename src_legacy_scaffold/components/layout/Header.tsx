import Link from "next/link";

const navItems = [
  { href: "/upload", label: "업로드" },
  { href: "/generate", label: "스타일 생성" },
  { href: "/mypage", label: "마이페이지" },
];

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold">
          HairFit AI
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-700">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-black">
              {item.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}
