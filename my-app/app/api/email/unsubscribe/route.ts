import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

async function unsubscribe(request:Request){
  const url=new URL(request.url);
  let token=url.searchParams.get("token")?.trim()||"";
  if(request.method==="POST"&&!token){
    const contentType=request.headers.get("content-type")||"";
    if(contentType.includes("application/json"))token=String(((await request.json().catch(()=>({}))) as {token?:unknown}).token||"");
    else token=String((await request.formData().catch(()=>new FormData())).get("token")||"");
  }
  if(!/^[0-9a-f-]{36}$/i.test(token))return NextResponse.json({error:"수신거부 링크가 올바르지 않습니다."},{status:400});
  const result=await getSupabaseAdminClient().rpc("unsubscribe_marketing_email_v2",{p_token:token});
  if(result.error)return NextResponse.json({error:"수신거부를 처리하지 못했습니다."},{status:500});
  return NextResponse.json({unsubscribed:result.data===true});
}

export const GET=unsubscribe;
export const POST=unsubscribe;
