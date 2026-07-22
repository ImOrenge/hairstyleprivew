-- Salon/member matching invite flow.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'salon_match_status') then
    create type public.salon_match_status as enum ('pending', 'linked', 'revoked');
  end if;
end
$$;

create table if not exists public.salon_match_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(id) on delete cascade,
  code text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salon_match_invites_code_length check (char_length(code) between 12 and 64)
);

create table if not exists public.salon_match_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(id) on delete cascade,
  member_user_id text not null references public.users(id) on delete cascade,
  invite_id uuid references public.salon_match_invites(id) on delete set null,
  status public.salon_match_status not null default 'pending',
  linked_customer_id uuid references public.salon_customers(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salon_match_requests_owner_member_unique unique (owner_user_id, member_user_id),
  constraint salon_match_requests_linked_requires_customer
    check (status <> 'linked' or linked_customer_id is not null)
);

create index if not exists idx_salon_match_invites_owner_active
  on public.salon_match_invites(owner_user_id, active, created_at desc);

create index if not exists idx_salon_match_requests_owner_status_updated
  on public.salon_match_requests(owner_user_id, status, updated_at desc);

create index if not exists idx_salon_match_requests_member_updated
  on public.salon_match_requests(member_user_id, updated_at desc);

drop trigger if exists trg_salon_match_invites_set_updated_at on public.salon_match_invites;
create trigger trg_salon_match_invites_set_updated_at
before update on public.salon_match_invites
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_salon_match_requests_set_updated_at on public.salon_match_requests;
create trigger trg_salon_match_requests_set_updated_at
before update on public.salon_match_requests
for each row
execute procedure public.set_updated_at();

alter table public.salon_match_invites enable row level security;
alter table public.salon_match_requests enable row level security;

drop policy if exists "salon_match_invites_select_owner" on public.salon_match_invites;
create policy "salon_match_invites_select_owner"
  on public.salon_match_invites
  for select
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_match_invites_insert_owner" on public.salon_match_invites;
create policy "salon_match_invites_insert_owner"
  on public.salon_match_invites
  for insert
  to authenticated
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_match_invites_update_owner" on public.salon_match_invites;
create policy "salon_match_invites_update_owner"
  on public.salon_match_invites
  for update
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'))
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_match_requests_select_participant" on public.salon_match_requests;
create policy "salon_match_requests_select_participant"
  on public.salon_match_requests
  for select
  to authenticated
  using (
    owner_user_id = (select auth.jwt() ->> 'sub')
    or member_user_id = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "salon_match_requests_insert_member" on public.salon_match_requests;
create policy "salon_match_requests_insert_member"
  on public.salon_match_requests
  for insert
  to authenticated
  with check (member_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_match_requests_update_participant" on public.salon_match_requests;
create policy "salon_match_requests_update_participant"
  on public.salon_match_requests
  for update
  to authenticated
  using (
    owner_user_id = (select auth.jwt() ->> 'sub')
    or member_user_id = (select auth.jwt() ->> 'sub')
  )
  with check (
    owner_user_id = (select auth.jwt() ->> 'sub')
    or member_user_id = (select auth.jwt() ->> 'sub')
  );
