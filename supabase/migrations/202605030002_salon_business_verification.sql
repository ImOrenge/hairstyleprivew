alter table public.salon_profiles
  add column if not exists business_registration_number text,
  add column if not exists business_started_on date,
  add column if not exists business_representative_name text,
  add column if not exists business_status_code text,
  add column if not exists business_status_label text,
  add column if not exists business_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'salon_profiles_business_registration_number_digits'
       and conrelid = 'public.salon_profiles'::regclass
  ) then
    alter table public.salon_profiles
      add constraint salon_profiles_business_registration_number_digits
      check (
        business_registration_number is null
        or business_registration_number ~ '^[0-9]{10}$'
      );
  end if;
end
$$;

create index if not exists idx_salon_profiles_business_registration_number
  on public.salon_profiles (business_registration_number)
  where business_registration_number is not null;
