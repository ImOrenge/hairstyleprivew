-- HairFit AI seed data (idempotent)
-- Run manually after migrations:
--   supabase db push
--   psql <connection> -f supabase/seed.sql

insert into public.users (id, email, display_name)
values
  ('user_demo_001', 'demo1@hairfit.ai', 'Demo User 1'),
  ('user_demo_002', 'demo2@hairfit.ai', 'Demo User 2')
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    updated_at = timezone('utc', now());

with demo_generation as (
  insert into public.generations (
    user_id,
    original_image_path,
    generated_image_path,
    prompt_used,
    options,
    status,
    credits_used,
    model_provider,
    model_name
  )
  select
    'user_demo_001',
    'original/demo-user-001.jpg',
    'generated/demo-user-001-layered.jpg',
    'brown layered hair, medium length, female, photorealistic',
    '{"gender":"female","length":"medium","style":"layered","color":"brown"}'::jsonb,
    'completed'::public.generation_status,
    5,
    'gemini',
    'gemini-3-pro-image-preview'
  where not exists (
    select 1
      from public.generations
     where user_id = 'user_demo_001'
       and original_image_path = 'original/demo-user-001.jpg'
       and generated_image_path = 'generated/demo-user-001-layered.jpg'
  )
  returning id
)
select 1
from demo_generation;

insert into public.payment_transactions (
  id,
  user_id,
  provider,
  provider_order_id,
  provider_customer_id,
  status,
  currency,
  amount,
  credits_to_grant,
  metadata,
  paid_at
)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_demo_001',
  'polar'::public.payment_provider,
  'order_demo_001',
  'customer_demo_001',
  'paid'::public.payment_status,
  'KRW',
  9900,
  100,
  '{"plan":"starter-100"}'::jsonb,
  timezone('utc', now())
where not exists (
  select 1
    from public.payment_transactions
   where id = '11111111-1111-1111-1111-111111111111'::uuid
);

select public.grant_credits(
  'user_demo_001',
  20,
  'grant',
  'seed_welcome_credits',
  '{"seed":true}'::jsonb,
  null
)
where not exists (
  select 1
    from public.credit_ledger
   where user_id = 'user_demo_001'
     and reason = 'seed_welcome_credits'
);

select public.apply_payment_credits('11111111-1111-1111-1111-111111111111'::uuid, 'seed_payment_apply')
where not exists (
  select 1
    from public.credit_ledger
   where payment_transaction_id = '11111111-1111-1111-1111-111111111111'::uuid
     and entry_type = 'purchase'
);
