/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerStylebookPublicActions } from "../../../../components/customer/stylebook/CustomerStylebookPublicActions";
import { readPublicCustomerStylebookShareV2 } from "../../../../lib/v2/customer-stylebook-actions-server";

export const metadata: Metadata = {
  title: "공유된 스타일북",
  robots: { index: false, follow: false },
};

export default async function CustomerStylebookSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const share = await readPublicCustomerStylebookShareV2((await params).token);
  if (!share) notFound();
  const item = share.item;
  const title = item.state.customTitle ?? item.title;

  return (
    <article className="customer-stylebook-public">
      <header>
        <div>
          <p className="customer-kicker">HairFit private stylebook</p>
          <h1>{title}</h1>
          <p>공유 만료 · {new Date(share.expiresAt).toLocaleString("ko-KR")}</p>
        </div>
        <CustomerStylebookPublicActions />
      </header>

      <section className="customer-stylebook-public__grid">
        <div className="customer-stylebook-public__visual">
          {item.imageUrl ? <img src={item.imageUrl} alt={title} /> : <span aria-hidden="true">HF</span>}
        </div>
        <div className="customer-stylebook-public__details">
          <article>
            <p className="customer-kicker">추천 결과</p>
            <h2>{item.kind === "hair" ? item.description : `${item.genre} · ${item.silhouette}`}</h2>
            {item.kind === "hair" ? (
              <dl>
                <div><dt>길이</dt><dd>{item.length}</dd></div>
                <div><dt>앞머리</dt><dd>{item.bang}</dd></div>
                <div><dt>질감</dt><dd>{item.texture}</dd></div>
                <div><dt>관리 난이도</dt><dd>{item.maintenanceLevel}</dd></div>
              </dl>
            ) : (
              <dl>
                <div><dt>넥라인</dt><dd>{item.neckline}</dd></div>
                <div><dt>실루엣</dt><dd>{item.silhouette}</dd></div>
                <div><dt>추천 아이템</dt><dd>{item.items.map((entry) => entry.name).join(", ")}</dd></div>
                <div><dt>쇼핑 키워드</dt><dd>{item.shoppingKeywords.join(", ")}</dd></div>
              </dl>
            )}
          </article>
          {share.privateNote ? <article><p className="customer-kicker">공유 메모</p><p>{share.privateNote}</p></article> : null}
          {share.actualPhotoUrl ? (
            <article>
              <p className="customer-kicker">실제 적용 기록</p>
              <img src={share.actualPhotoUrl} alt={`${title} 실제 적용 기록`} />
            </article>
          ) : null}
          <p className="customer-stylebook-public__privacy">원본 얼굴 사진과 전체 분석 데이터는 포함되지 않습니다. 최종 시술과 구매는 현장 상태를 확인한 뒤 결정하세요.</p>
        </div>
      </section>
    </article>
  );
}
