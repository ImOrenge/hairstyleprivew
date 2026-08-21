create table if not exists public.personal_color_drape_sessions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  personal_color_profile_id uuid not null references public.personal_color_profiles_v2(id) on delete restrict,
  source_profile_version integer not null check (source_profile_version > 0),
  source_observation_bundle_id uuid not null references public.face_observation_bundles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','paused','sufficient_confidence','completed','abandoned','invalidated')),
  revision integer not null default 0 check (revision >= 0),
  posterior_before jsonb not null,
  posterior_after jsonb not null,
  pairs jsonb not null,
  response_count integer not null default 0 check (response_count between 0 and 10),
  harmony jsonb not null default '{"rankedColorIds":[],"evidence":[]}'::jsonb,
  preference jsonb not null default '{"likedColorIds":[],"dislikedColorIds":[],"preferredContrast":null}'::jsonb,
  stop_reason text check (stop_reason is null or stop_reason in ('entropy','confidence','max_pairs','user_stop')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists uq_personal_color_drape_active_profile
  on public.personal_color_drape_sessions(user_id,personal_color_profile_id)
  where status in ('active','paused');
create index if not exists idx_personal_color_drape_consultation_created
  on public.personal_color_drape_sessions(consultation_id,user_id,created_at desc);

create table if not exists public.personal_color_drape_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.personal_color_drape_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  pair_id text not null,
  response_revision integer not null check (response_revision > 0),
  response text not null check (response in ('left_better','right_better','no_meaningful_difference','unsure')),
  preference text check (preference is null or preference in ('left','right','neither')),
  supersedes_response_id uuid references public.personal_color_drape_responses(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(session_id,pair_id,response_revision)
);

create index if not exists idx_personal_color_drape_responses_session_pair_revision
  on public.personal_color_drape_responses(session_id,pair_id,response_revision desc);

create or replace function public.append_personal_color_drape_response(
  p_user_id text,
  p_session_id uuid,
  p_expected_revision integer,
  p_pair_id text,
  p_response text,
  p_preference text,
  p_posterior_after jsonb,
  p_harmony jsonb,
  p_preference_profile jsonb,
  p_terminal_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_session public.personal_color_drape_sessions%rowtype;
  v_previous public.personal_color_drape_responses%rowtype;
  v_response_revision integer;
  v_response_count integer;
  v_active_profile_id uuid;
  v_status text;
begin
  select * into v_session from public.personal_color_drape_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Drape session not found'; end if;
  if v_session.revision<>p_expected_revision then return jsonb_build_object('state','conflict','revision',v_session.revision); end if;
  if v_session.status not in ('active','paused','sufficient_confidence') then return jsonb_build_object('state',v_session.status,'revision',v_session.revision); end if;
  select profile_id into v_active_profile_id from public.active_personal_color_profiles_v2 where user_id=p_user_id;
  if v_active_profile_id is distinct from v_session.personal_color_profile_id then
    update public.personal_color_drape_sessions set status='invalidated',revision=revision+1 where id=p_session_id;
    return jsonb_build_object('state','invalidated','revision',v_session.revision+1);
  end if;
  if p_response not in ('left_better','right_better','no_meaningful_difference','unsure') then raise exception 'Invalid drape response'; end if;
  if p_preference is not null and p_preference not in ('left','right','neither') then raise exception 'Invalid drape preference'; end if;
  if not (v_session.pairs @> jsonb_build_array(jsonb_build_object('id',p_pair_id))) then raise exception 'Drape pair not found'; end if;

  select * into v_previous from public.personal_color_drape_responses
   where session_id=p_session_id and pair_id=p_pair_id
   order by response_revision desc limit 1;
  v_response_revision := coalesce(v_previous.response_revision,0)+1;
  insert into public.personal_color_drape_responses(session_id,user_id,pair_id,response_revision,response,preference,supersedes_response_id)
  values(p_session_id,p_user_id,p_pair_id,v_response_revision,p_response,p_preference,v_previous.id);
  select count(distinct pair_id)::integer into v_response_count from public.personal_color_drape_responses where session_id=p_session_id;
  if p_terminal_reason is not null and p_terminal_reason not in ('entropy','confidence','max_pairs') then raise exception 'Invalid terminal reason'; end if;
  v_status := case when p_terminal_reason is null then 'active' else 'sufficient_confidence' end;
  update public.personal_color_drape_sessions set
    status=v_status,revision=revision+1,posterior_after=p_posterior_after,response_count=v_response_count,
    harmony=p_harmony,preference=p_preference_profile,stop_reason=p_terminal_reason,
    completed_at=case when p_terminal_reason is null then null else now() end
  where id=p_session_id;
  return jsonb_build_object('state','applied','revision',v_session.revision+1,'responseRevision',v_response_revision,'status',v_status,'responseCount',v_response_count);
end;
$$;

create or replace function public.complete_personal_color_drape_session(
  p_user_id text,
  p_session_id uuid,
  p_expected_revision integer,
  p_abandon boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_session public.personal_color_drape_sessions%rowtype; v_active_profile_id uuid; v_status text;
begin
  select * into v_session from public.personal_color_drape_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Drape session not found'; end if;
  if v_session.revision<>p_expected_revision then return jsonb_build_object('state','conflict','revision',v_session.revision); end if;
  if v_session.status in ('completed','abandoned') then
    return jsonb_build_object('state',v_session.status,'revision',v_session.revision,'idempotentReplay',true);
  end if;
  if v_session.status='invalidated' then return jsonb_build_object('state','invalidated','revision',v_session.revision); end if;
  select profile_id into v_active_profile_id from public.active_personal_color_profiles_v2 where user_id=p_user_id;
  if v_active_profile_id is distinct from v_session.personal_color_profile_id then
    update public.personal_color_drape_sessions set status='invalidated',revision=revision+1 where id=p_session_id;
    return jsonb_build_object('state','invalidated','revision',v_session.revision+1);
  end if;
  v_status := case when p_abandon then 'abandoned' else 'completed' end;
  update public.personal_color_drape_sessions set status=v_status,revision=revision+1,
    stop_reason=case when p_abandon then stop_reason else 'user_stop' end,completed_at=now()
  where id=p_session_id;
  return jsonb_build_object('state',v_status,'revision',v_session.revision+1);
end;
$$;

create or replace function public.invalidate_personal_color_drape_on_profile_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  update public.personal_color_drape_sessions
     set status='invalidated',revision=revision+1
   where user_id=new.user_id and consultation_id=new.consultation_id
     and personal_color_profile_id<>new.id and status in ('active','paused','sufficient_confidence');
  return new;
end;
$$;

drop trigger if exists trg_invalidate_personal_color_drape_on_profile_change on public.personal_color_profiles_v2;
create trigger trg_invalidate_personal_color_drape_on_profile_change
after insert on public.personal_color_profiles_v2
for each row execute function public.invalidate_personal_color_drape_on_profile_change();

alter table public.personal_color_drape_sessions enable row level security;
alter table public.personal_color_drape_sessions force row level security;
alter table public.personal_color_drape_responses enable row level security;
alter table public.personal_color_drape_responses force row level security;
revoke all on public.personal_color_drape_sessions,public.personal_color_drape_responses from public,anon,authenticated;
grant select,insert,update,delete on public.personal_color_drape_sessions,public.personal_color_drape_responses to service_role;
revoke all on function public.append_personal_color_drape_response(text,uuid,integer,text,text,text,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.complete_personal_color_drape_session(text,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.append_personal_color_drape_response(text,uuid,integer,text,text,text,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.complete_personal_color_drape_session(text,uuid,integer,boolean) to service_role;
