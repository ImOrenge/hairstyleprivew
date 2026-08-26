import "server-only";
import type { OfferCatalogV2, ProductOfferingV2, ProductPriceV2 } from "@hairfit/shared/v2";
import { getFullStylePlanDisplayName } from "../premium-offer-policy";
import { getSupabaseAdminClient } from "../supabase";

type PriceRow = { id:string; version:number; provider:ProductPriceV2["provider"]; provider_product_id:string|null; currency:string; amount_minor:number; status:ProductPriceV2["status"]; valid_from:string|null; valid_until:string|null };
type OfferingRow = { id:string; offering_key:string; version:number; internal_name:string; customer_name:string|null; description:string; purchase_mode:ProductOfferingV2["purchaseMode"]; billing_interval:ProductOfferingV2["billingInterval"]; status:ProductOfferingV2["status"]; included_consultation_sessions:number; release_policy:string|null; capabilities:ProductOfferingV2["capabilities"]; product_prices_v2?:PriceRow[] };
function mapPrice(row: PriceRow): ProductPriceV2 { return { id:row.id,version:row.version,provider:row.provider,providerProductId:row.provider_product_id,currency:row.currency,amountMinor:row.amount_minor,status:row.status,validFrom:row.valid_from,validUntil:row.valid_until }; }
function mapOffering(row: OfferingRow): ProductOfferingV2 { return { id:row.id,key:row.offering_key,version:row.version,internalName:row.internal_name,customerName:getFullStylePlanDisplayName(row.offering_key) ?? row.customer_name,description:row.description,purchaseMode:row.purchase_mode,billingInterval:row.billing_interval,status:row.status,includedConsultationSessions:row.included_consultation_sessions,releasePolicy:row.release_policy,capabilities:row.capabilities,prices:(row.product_prices_v2 ?? []).map(mapPrice) }; }
export async function getActiveCatalogV2(): Promise<OfferCatalogV2> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient().from("product_offerings_v2").select("id,offering_key,version,internal_name,customer_name,description,purchase_mode,billing_interval,status,included_consultation_sessions,release_policy,capabilities,product_prices_v2(id,version,provider,provider_product_id,currency,amount_minor,status,valid_from,valid_until)").eq("status","active").order("offering_key");
  if (error) throw new Error(error.message);
  const offerings = ((data ?? []) as unknown as OfferingRow[]).map(mapOffering).map((item) => ({ ...item, prices:item.prices.filter((price) => price.status === "active" && (!price.validFrom || price.validFrom <= now) && (!price.validUntil || price.validUntil > now)) }));
  return { schemaVersion:"offer-catalog-v1",catalogVersion:offerings.map((item) => `${item.key}:v${item.version}:${item.prices.map((price) => price.version).join(".")}`).join("|") || "empty",generatedAt:now,offerings };
}
