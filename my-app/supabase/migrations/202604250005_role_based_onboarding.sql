do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type public.account_type as enum ('member', 'salon_owner');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_style_target') then
    create type public.member_style_target as enum ('male', 'female', 'neutral');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_style_tone') then
    create type public.member_style_tone as enum ('natural', 'trendy', 'soft', 'bold');
  end if;
end
$$;

alter table public.users
  add column if not exists account_type public.account_type,
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.member_profiles (
  user_id text primary key references public.users(id) on delete cascade,
  display_name text not null,
  style_target public.member_style_target not null,
  preferred_style_tone public.member_style_tone not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.salon_profiles (
  user_id text primary key references public.users(id) on delete cascade,
  manager_name text not null,
  shop_name text not null,
  contact_phone text not null,
  region text not null,
  instagram_handle text,
  introduction text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_member_profiles_set_updated_at on public.member_profiles;
create trigger trg_member_profiles_set_updated_at
before update on public.member_profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_salon_profiles_set_updated_at on public.salon_profiles;
create trigger trg_salon_profiles_set_updated_at
before update on public.salon_profiles
for each row
execute procedure public.set_updated_at();

alter table public.member_profiles enable row level security;
alter table public.salon_profiles enable row level security;

drop policy if exists "member_profiles_select_own" on public.member_profiles;
create policy "member_profiles_select_own"
  on public.member_profiles
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "member_profiles_insert_own" on public.member_profiles;
create policy "member_profiles_insert_own"
  on public.member_profiles
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "member_profiles_update_own" on public.member_profiles;
create policy "member_profiles_update_own"
  on public.member_profiles
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "member_profiles_delete_own" on public.member_profiles;
create policy "member_profiles_delete_own"
  on public.member_profiles
  for delete
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "salon_profiles_select_own" on public.salon_profiles;
create policy "salon_profiles_select_own"
  on public.salon_profiles
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "salon_profiles_insert_own" on public.salon_profiles;
create policy "salon_profiles_insert_own"
  on public.salon_profiles
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "salon_profiles_update_own" on public.salon_profiles;
create policy "salon_profiles_update_own"
  on public.salon_profiles
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "salon_profiles_delete_own" on public.salon_profiles;
create policy "salon_profiles_delete_own"
  on public.salon_profiles
  for delete
  using (user_id = auth.jwt() ->> 'sub');
