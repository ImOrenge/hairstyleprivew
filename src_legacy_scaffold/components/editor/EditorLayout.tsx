import { ReactNode } from "react";

interface EditorLayoutProps {
  preview: ReactNode;
  panel: ReactNode;
}

export function EditorLayout({ preview, panel }: EditorLayoutProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">{preview}</div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">{panel}</div>
    </section>
  );
}
