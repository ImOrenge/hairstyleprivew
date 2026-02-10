import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-stone-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} StyleMirror</p>
        <div className="flex items-center gap-3">
          <Link href="/privacy-policy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <p>Built with Clerk, Polar, Supabase, and Gemini</p>
        </div>
      </div>
    </footer>
  );
}
