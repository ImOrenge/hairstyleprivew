import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";
import { AppClerkProvider } from "../components/providers/AppClerkProvider";
import { LocaleSync } from "../components/layout/LocaleSync";
import { PointerGlowProvider } from "../components/providers/PointerGlowProvider";
import { ThemeProvider } from "../components/providers/ThemeProvider";
import { inter, notoSansKR } from "../lib/fonts";
import { homeSeo } from "../lib/home-content";
import { getSiteUrl } from "../lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: homeSeo.title,
    template: "%s - HairFit",
  },
  description: homeSeo.description,
  keywords: homeSeo.keywords,
  openGraph: {
    title: homeSeo.title,
    description: homeSeo.description,
    type: "website",
    locale: "ko_KR",
    images: [
      {
        url: "/logo.png",
        width: 1024,
        height: 1024,
        alt: "HairFit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeSeo.title,
    description: homeSeo.description,
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" className={`${inter.variable} ${notoSansKR.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <AppClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            scriptProps={{ "data-cfasync": "false" }}
          >
            <LocaleSync />
            <PointerGlowProvider />
            <Header />
            <main>{children}</main>
            <Footer />
          </ThemeProvider>
        </AppClerkProvider>
      </body>
    </html>
  );
}
