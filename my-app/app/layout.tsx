import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";

export const metadata: Metadata = {
  title: "HairFit",
  description: "자르기 전에, 내 얼굴로 먼저 확인하는 AI 헤어스타일 미리보기",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkKey =
    typeof publishableKey === "string" &&
    publishableKey.startsWith("pk_") &&
    !publishableKey.includes("YOUR_");

  const appShell = (
    <html lang="ko">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );

  if (!hasClerkKey) {
    return appShell;
  }

  return <ClerkProvider publishableKey={publishableKey}>{appShell}</ClerkProvider>;
}
