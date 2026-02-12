import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";
import { LocaleSync } from "../components/layout/LocaleSync";
import { getClerkConfigState } from "../lib/clerk";
import { ThemeProvider } from "../components/providers/ThemeProvider";
import { inter, notoSansKR } from "../lib/fonts";

export const metadata: Metadata = {
  title: "HairFit - AI Hairstyle Preview",
  description: "자르기 전에, 내 얼굴로 먼저 확인하는 AI 헤어스타일 미리보기. 당신에게 어울리는 스타일을 데이터로 추천합니다.",
  keywords: ["AI 헤어스타일", "헤어스타일 미리보기", "헤어핏", "헤어 스타일링", "가상 헤어"],
  openGraph: {
    title: "HairFit - AI Hairstyle Preview",
    description: "내 얼굴로 먼저 확인하는 AI 헤어스타일 미리보기",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HairFit - AI Hairstyle Preview",
    description: "내 얼굴로 먼저 확인하는 AI 헤어스타일 미리보기",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { canUseClerkFrontend, publishableKey } = getClerkConfigState();

  const appShell = (
    <html lang="ko" className={`${inter.variable} ${notoSansKR.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LocaleSync />
          <Header clerkEnabled={canUseClerkFrontend} />
          <main>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );


  if (!canUseClerkFrontend || !publishableKey) {
    return appShell;
  }

  return <ClerkProvider publishableKey={publishableKey}>{appShell}</ClerkProvider>;
}
