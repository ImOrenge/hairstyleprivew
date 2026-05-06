-- Salon CRM linked hair-only workspace.

alter table if exists public.salon_customers
  add column if not exists style_target text,
  add column if not exists photo_generation_consent_at timestamptz;

alter table if exists public.salon_customers
  drop constraint if exists salon_customers_style_target_check,
  add constraint salon_customers_style_target_check
    check (style_target is null or style_target in ('male', 'female'));

alter table if exists public.salon_customer_visits
  add column if not exists generation_id uuid references public.generations(id) on delete set null,
  add column if not exists selected_variant_id text,
  add column if not exists style_label text,
  add column if not exists service_type text,
  add column if not exists designer_brief jsonb;

alter table if exists public.salon_customer_visits
  drop constraint if exists salon_customer_visits_service_type_check,
  add constraint salon_customer_visits_service_type_check
    check (
      service_type is null
      or service_type in ('perm', 'color', 'cut', 'bleach', 'treatment', 'other')
    );

create index if not exists idx_salon_customer_visits_generation
  on public.salon_customer_visits (generation_id)
  where generation_id is not null;
