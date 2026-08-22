import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppPage, Panel } from "../../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { PromotionRedeemForm } from "./PromotionRedeemForm";

export default async function PromotionRedeemPage(){const {userId}=await auth();if(!userId)redirect(buildSignInRedirectUrl("/promotions/redeem"));return <AppPage className="py-10"><Panel className="mx-auto grid max-w-xl gap-5 p-6"><div><p className="app-kicker">Official launch benefit</p><h1 className="mt-2 text-3xl font-black">기존 회원 무료 풀스타일 1회권</h1><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">정밀 퍼스널 컬러부터 헤어 9개, 메이크업·패션, AI 리포트와 D+30 사후상담까지 한 번에 경험하세요.</p></div><PromotionRedeemForm/></Panel></AppPage>}
