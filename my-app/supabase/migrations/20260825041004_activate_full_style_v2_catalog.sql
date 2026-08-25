-- Make the approved full-style V2 catalog the only sellable full-style version.
-- This intentionally repairs environments where full_style_once V2 remained draft.
do $migration$
declare
  v_offering_count integer;
  v_price_count integer;
begin
  select count(*) into v_offering_count
  from public.product_offerings_v2
  where offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and version = 2;

  select count(*) into v_price_count
  from public.product_prices_v2 p
  join public.product_offerings_v2 o on o.id = p.offering_id
  where o.offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and o.version = 2
    and p.version = 2
    and p.provider = 'portone';

  if v_offering_count <> 3 or v_price_count <> 3 then
    raise exception 'FULL_STYLE_V2_CATALOG_INCOMPLETE';
  end if;

  update public.product_prices_v2 p
  set status = 'retired'
  from public.product_offerings_v2 o
  where p.offering_id = o.id
    and o.offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and o.version = 1
    and p.version = 1;

  update public.product_offerings_v2
  set status = 'retired', updated_at = timezone('utc', now())
  where offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and version = 1;

  update public.product_prices_v2 p
  set status = 'active'
  from public.product_offerings_v2 o
  where p.offering_id = o.id
    and o.offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and o.version = 2
    and p.version = 2
    and p.provider = 'portone';

  update public.product_offerings_v2
  set status = 'active', updated_at = timezone('utc', now())
  where offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
    and version = 2;
end
$migration$;
