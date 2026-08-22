import { AppPage, Panel } from "../../../components/ui/Surface";
import { UnsubscribeForm } from "./UnsubscribeForm";

export default async function EmailUnsubscribePage({searchParams}:{searchParams:Promise<{token?:string}>}){
  const {token=""}=await searchParams;
  return <AppPage className="py-12"><Panel className="mx-auto grid max-w-lg gap-5 p-6"><div><p className="app-kicker">Email preference</p><h1 className="mt-2 text-2xl font-black">광고성 이메일 수신 설정</h1></div>{/^[0-9a-f-]{36}$/i.test(token)?<UnsubscribeForm token={token}/>:<p role="alert">수신거부 링크가 올바르지 않습니다.</p>}</Panel></AppPage>;
}
