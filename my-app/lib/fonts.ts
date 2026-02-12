import { Inter, Noto_Sans_KR } from "next/font/google";

export const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

export const notoSansKR = Noto_Sans_KR({
    subsets: ["latin"],
    weight: ["400", "500", "700", "900"],
    display: "swap",
    variable: "--font-noto-sans-kr",
});
