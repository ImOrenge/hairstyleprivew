export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-6 py-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} HairFit AI</p>
        <p>Clerk · Polar · Supabase · Replicate</p>
      </div>
    </footer>
  );
}
