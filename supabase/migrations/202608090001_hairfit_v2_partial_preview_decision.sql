-- HairFit V2 allows users to shortlist and decide as soon as 2 quality-accepted
-- previews exist. The function ACL remains service-role only; browser roles cannot
-- invoke these aggregate mutations directly.

create or replace function public.transition_consultation_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_expected_version integer,
  p_next_state text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.consultation_sessions%rowtype;
  v_allowed boolean := false;
begin
  select *
    into v_session
    from public.consultation_sessions
   where id = p_consultation_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'CONSULTATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.version <> p_expected_version then
    return jsonb_build_object(
      'state', 'conflict',
      'version', v_session.version,
      'lifecycleState', v_session.lifecycle_state
    );
  end if;

  v_allowed := (v_session.lifecycle_state, p_next_state) in (
    ('draft','photo_validated'),
    ('draft','cancelled'),
    ('photo_validated','analysis_ready'),
    ('photo_validated','cancelled'),
    ('analysis_ready','preview_board_queued'),
    ('analysis_ready','cancelled'),
    ('preview_board_queued','preview_board_ready'),
    ('preview_board_queued','shortlisted'),
    ('preview_board_queued','cancelled'),
    ('preview_board_ready','shortlisted'),
    ('preview_board_ready','style_selected'),
    ('shortlisted','style_selected'),
    ('style_selected','preview_board_ready'),
    ('style_selected','selection_confirmed'),
    ('selection_confirmed','salon_brief_ready'),
    ('selection_confirmed','aftercare_ready'),
    ('selection_confirmed','fashion_ready'),
    ('selection_confirmed','completed'),
    ('salon_brief_ready','aftercare_ready'),
    ('salon_brief_ready','fashion_ready'),
    ('salon_brief_ready','completed'),
    ('aftercare_ready','salon_brief_ready'),
    ('aftercare_ready','fashion_ready'),
    ('aftercare_ready','completed'),
    ('fashion_ready','salon_brief_ready'),
    ('fashion_ready','aftercare_ready'),
    ('fashion_ready','completed')
  );

  if not v_allowed then
    raise exception 'INVALID_CONSULTATION_TRANSITION:%:%',
      v_session.lifecycle_state,
      p_next_state
      using errcode = '23514';
  end if;

  update public.consultation_sessions
     set lifecycle_state = p_next_state,
         version = version + 1,
         updated_at = timezone('utc', now()),
         completed_at = case
           when p_next_state = 'completed' then timezone('utc', now())
           else completed_at
         end,
         cancelled_at = case
           when p_next_state = 'cancelled' then timezone('utc', now())
           else cancelled_at
         end
   where id = p_consultation_id;

  return jsonb_build_object(
    'state', 'updated',
    'version', v_session.version + 1,
    'lifecycleState', p_next_state
  );
end
$$;

create or replace function public.draft_style_selection_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_preview_variant_id uuid,
  p_snapshot_id uuid,
  p_snapshot_version integer,
  p_expected_version integer,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.consultation_sessions%rowtype;
  v_variant public.preview_variants_v2%rowtype;
  v_next_version integer;
begin
  select *
    into v_session
    from public.consultation_sessions
   where id = p_consultation_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'CONSULTATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.version <> p_expected_version then
    return jsonb_build_object('state', 'conflict', 'version', v_session.version);
  end if;

  if v_session.lifecycle_state not in (
    'preview_board_queued',
    'preview_board_ready',
    'shortlisted',
    'style_selected'
  ) then
    raise exception 'SELECTION_NOT_ALLOWED' using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.style_selection_snapshots_v2
     where consultation_id = p_consultation_id
       and status = 'confirmed'
  ) then
    raise exception 'SELECTION_LOCKED' using errcode = '23514';
  end if;

  select v.*
    into v_variant
    from public.preview_variants_v2 v
    join public.preview_boards_v2 b on b.id = v.board_id
   where v.id = p_preview_variant_id
     and v.user_id = p_user_id
     and v.status = 'accepted'
     and b.consultation_id = p_consultation_id
     and b.state in ('generating', 'ready');

  if not found then
    raise exception 'PREVIEW_VARIANT_NOT_ACCEPTED' using errcode = 'P0002';
  end if;

  select coalesce(max(snapshot_version), 0) + 1
    into v_next_version
    from public.style_selection_snapshots_v2
   where consultation_id = p_consultation_id;

  if p_snapshot_version <> v_next_version
     or p_snapshot ->> 'id' <> p_snapshot_id::text then
    raise exception 'INVALID_SNAPSHOT_VERSION' using errcode = '22023';
  end if;

  update public.style_selection_snapshots_v2
     set status = 'superseded'
   where consultation_id = p_consultation_id
     and status = 'draft';

  insert into public.style_selection_snapshots_v2(
    id,
    consultation_id,
    user_id,
    preview_variant_id,
    accepted_attempt_id,
    snapshot_version,
    status,
    snapshot
  )
  values(
    p_snapshot_id,
    p_consultation_id,
    p_user_id,
    p_preview_variant_id,
    v_variant.accepted_attempt_id,
    p_snapshot_version,
    'draft',
    p_snapshot
  );

  update public.consultation_sessions
     set selected_snapshot_id = p_snapshot_id,
         lifecycle_state = 'style_selected',
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = p_consultation_id;

  return jsonb_build_object(
    'state', 'drafted',
    'snapshotId', p_snapshot_id,
    'snapshotVersion', p_snapshot_version,
    'version', v_session.version + 1
  );
end
$$;

revoke execute on function public.transition_consultation_v2(text, uuid, integer, text)
  from public, anon, authenticated;
revoke execute on function public.draft_style_selection_v2(text, uuid, uuid, uuid, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.transition_consultation_v2(text, uuid, integer, text)
  to service_role;
grant execute on function public.draft_style_selection_v2(text, uuid, uuid, uuid, integer, integer, jsonb)
  to service_role;
