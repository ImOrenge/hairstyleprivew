import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";

export const metadata: Metadata = {
  title: "HairFit AI",
  description: "AI 헤어스타일 미리보기 SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
