begin;

update public.product_prices_v2
set status='retired',valid_until=coalesce(valid_until,timezone('utc',now()))
where offering_id in (
  select id from public.product_offerings_v2
  where offering_key in ('full_style_once','full_style_quarterly','full_style_annual') and version=2
) and status='active';

update public.product_offerings_v2
set status='retired',updated_at=timezone('utc',now())
where offering_key in ('full_style_once','full_style_quarterly','full_style_annual')
  and version=2 and status='active';

insert into public.product_offerings_v2(
  offering_key,version,internal_name,customer_name,description,purchase_mode,billing_interval,status,
  included_consultation_sessions,release_policy,capabilities
)
select
  offering_key,
  3,
  case offering_key
    when 'full_style_once' then 'Full Style Once V3'
    when 'full_style_quarterly' then 'Full Style Quarterly V3'
    else 'Full Style Annual V3'
  end,
  case offering_key
    when 'full_style_once' then '풀 스타일 1회'
    when 'full_style_quarterly' then '3개월 관리형'
    else '연간'
  end,
  case offering_key
    when 'full_style_once' then '풀코스 1회, 전체 재시작 1회와 시술 후 D+30 AI 사후상담 1회.'
    when 'full_style_quarterly' then '3개월마다 풀코스 1회, 전체 재시작 2회와 D+30, 60, 90 AI 사후상담.'
    else '연 4회, 각 상담 전체 재시작 5회와 D+30, 60, 90 AI 사후상담.'
  end,
  purchase_mode,billing_interval,'active',included_consultation_sessions,'full-style-v3',capabilities
from public.product_offerings_v2
where offering_key in ('full_style_once','full_style_quarterly','full_style_annual') and version=2
on conflict(offering_key,version) do nothing;

update public.product_offerings_v2
set status='active',updated_at=timezone('utc',now())
where offering_key in ('full_style_once','full_style_quarterly','full_style_annual') and version=3;

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,3,'portone','hairfit-full-style-once-v3','KRW',59000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_once' and version=3
on conflict(offering_id,version,provider) do update
set provider_product_id=excluded.provider_product_id,currency=excluded.currency,amount_minor=excluded.amount_minor,
    status='active',valid_from=excluded.valid_from,valid_until=null;

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,3,'portone','hairfit-full-style-quarterly-v3','KRW',129000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_quarterly' and version=3
on conflict(offering_id,version,provider) do update
set provider_product_id=excluded.provider_product_id,currency=excluded.currency,amount_minor=excluded.amount_minor,
    status='active',valid_from=excluded.valid_from,valid_until=null;

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,3,'portone','hairfit-full-style-annual-v3','KRW',412800,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_annual' and version=3
on conflict(offering_id,version,provider) do update
set provider_product_id=excluded.provider_product_id,currency=excluded.currency,amount_minor=excluded.amount_minor,
    status='active',valid_from=excluded.valid_from,valid_until=null;

do $$
declare
  v_offering_count integer;
  v_price_count integer;
begin
  select count(*) into v_offering_count
  from public.product_offerings_v2
  where offering_key in ('full_style_once','full_style_quarterly','full_style_annual')
    and version=3 and status='active';

  select count(*) into v_price_count
  from public.product_prices_v2 p
  join public.product_offerings_v2 o on o.id=p.offering_id
  where o.offering_key in ('full_style_once','full_style_quarterly','full_style_annual')
    and o.version=3 and o.status='active' and p.version=3 and p.provider='portone' and p.status='active';

  if v_offering_count<>3 or v_price_count<>3 then
    raise exception 'FULL_STYLE_V3_CATALOG_INCOMPLETE';
  end if;
end $$;

commit;
