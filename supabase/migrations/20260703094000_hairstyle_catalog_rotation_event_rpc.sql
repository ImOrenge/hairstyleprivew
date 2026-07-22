-- Generic rotation event writer for operational warnings such as lineup overlap.

create or replace function public.record_hairstyle_catalog_rotation_event(
  p_market text,
  p_event_type text,
  p_cycle_id uuid default null,
  p_message text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text := nullif(btrim(p_market), '');
  v_event_type text := nullif(btrim(p_event_type), '');
begin
  if v_market is null then
    raise exception 'p_market is required';
  end if;

  if v_event_type is null then
    raise exception 'p_event_type is required';
  end if;

  insert into public.hairstyle_catalog_rotation_events (
    market,
    cycle_id,
    event_type,
    message,
    metadata
  )
  values (
    v_market,
    p_cycle_id,
    v_event_type,
    coalesce(nullif(btrim(p_message), ''), 'Recorded hairstyle catalog rotation event.'),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_hairstyle_catalog_rotation_event(text, text, uuid, text, jsonb) from public;
grant execute on function public.record_hairstyle_catalog_rotation_event(text, text, uuid, text, jsonb) to service_role;
