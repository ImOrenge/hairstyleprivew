export function Footer() {
  return (
    <footer className="border-t border-stone-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-6 py-6 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} HairFit AI</p>
        <p>Built with Clerk, Polar, Supabase, and Gemini</p>
      </div>
    </footer>
  );
}
