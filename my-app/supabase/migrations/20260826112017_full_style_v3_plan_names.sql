begin;

update public.product_offerings_v2
set
  internal_name = case offering_key
    when 'full_style_once' then 'Private Hair Direction V3'
    when 'full_style_quarterly' then 'Total Image Direction V3'
    else 'Signature Style Membership V3'
  end,
  customer_name = case offering_key
    when 'full_style_once' then 'Private Hair Direction'
    when 'full_style_quarterly' then 'Total Image Direction'
    else 'Signature Style Membership'
  end,
  updated_at = timezone('utc', now())
where offering_key in ('full_style_once', 'full_style_quarterly', 'full_style_annual')
  and version = 3;

do $$
declare
  v_named_offerings integer;
begin
  select count(*) into v_named_offerings
  from public.product_offerings_v2
  where version = 3
    and (
      (offering_key = 'full_style_once' and customer_name = 'Private Hair Direction')
      or (offering_key = 'full_style_quarterly' and customer_name = 'Total Image Direction')
      or (offering_key = 'full_style_annual' and customer_name = 'Signature Style Membership')
    );

  if v_named_offerings <> 3 then
    raise exception 'FULL_STYLE_V3_PLAN_NAMES_INCOMPLETE';
  end if;
end $$;

commit;
