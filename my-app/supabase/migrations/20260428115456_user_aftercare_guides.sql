create table if not exists public.user_aftercare_guides (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references public.users(id) on delete cascade,
  hair_record_id uuid not null references public.user_hair_records(id) on delete cascade,
  guide_json     jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_aftercare_guides_hair_record_id_key unique (hair_record_id),
  constraint user_aftercare_guides_guide_shape_check check (
    jsonb_typeof(guide_json) = 'object'
    and guide_json ? 'overview'
    and guide_json ? 'sections'
    and guide_json ? 'maintenanceSchedule'
    and guide_json ? 'warnings'
    and guide_json ? 'recommendedNextActions'
    and guide_json->'sections' ? 'dry'
    and guide_json->'sections' ? 'treatment'
    and guide_json->'sections' ? 'iron'
    and guide_json->'sections' ? 'styling'
  )
);

create index if not exists idx_user_aftercare_guides_user_id
  on public.user_aftercare_guides(user_id, created_at desc);

drop trigger if exists trg_user_aftercare_guides_updated_at on public.user_aftercare_guides;
create trigger trg_user_aftercare_guides_updated_at
  before update on public.user_aftercare_guides
  for each row execute procedure public.set_updated_at();

alter table public.user_aftercare_guides enable row level security;
revoke all on table public.user_aftercare_guides from anon, authenticated;
drop policy if exists "user_aftercare_guides_select_own" on public.user_aftercare_guides;
create policy "user_aftercare_guides_select_own"
  on public.user_aftercare_guides
  for select
  to authenticated
  using (user_id = auth.jwt() ->> 'sub');

grant select, insert, update on public.user_aftercare_guides to service_role;
