\set ON_ERROR_STOP on

begin;

do $$
declare
  v_now timestamptz := '2026-07-18 00:00:00+00';
  v_user_id text := 'notification_retention_smoke_user';
  v_active_generation uuid := '71000000-0000-4000-8000-000000000001';
  v_sent_generation uuid := '71000000-0000-4000-8000-000000000002';
  v_unknown_kept_generation uuid := '71000000-0000-4000-8000-000000000003';
  v_unknown_redacted_generation uuid := '71000000-0000-4000-8000-000000000004';
  v_deleted_generation uuid := '71000000-0000-4000-8000-000000000005';
  v_styling_generation uuid := '71000000-0000-4000-8000-000000000006';
  v_styling_session uuid := '72000000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_count integer;
begin
  insert into public.users (id, email, display_name, credits)
  values (v_user_id, 'notification-retention@example.test', 'Retention Smoke', 100);

  insert into public.generations (
    id, user_id, original_image_path, generated_image_path, prompt_used,
    options, status, credits_used, model_provider
  ) values
    (v_active_generation, v_user_id, 'original/active.webp', 'generated/active.webp', 'active', '{}'::jsonb, 'completed', 10, 'test'),
    (v_sent_generation, v_user_id, 'original/sent.webp', 'generated/sent.webp', 'sent', '{}'::jsonb, 'completed', 10, 'test'),
    (v_unknown_kept_generation, v_user_id, 'original/unknown-kept.webp', null, 'unknown kept', '{}'::jsonb, 'failed', 0, 'test'),
    (v_unknown_redacted_generation, v_user_id, 'original/unknown-redacted.webp', null, 'unknown redacted', '{}'::jsonb, 'failed', 0, 'test'),
    (v_deleted_generation, v_user_id, 'original/deleted.webp', 'generated/deleted.webp', 'deleted', '{}'::jsonb, 'completed', 10, 'test'),
    (v_styling_generation, v_user_id, 'original/styling.webp', 'generated/styling.webp', 'styling', '{}'::jsonb, 'completed', 10, 'test');

  insert into public.styling_sessions (
    id, user_id, generation_id, selected_variant_id, genre, occasion, mood,
    recommendation, status, credits_used
  ) values (
    v_styling_session, v_user_id, v_styling_generation, 'retention-v1', 'minimal',
    'daily', 'clean', jsonb_build_object('headline', 'Retention smoke'), 'recommended', 0
  );

  insert into public.generation_notification_outbox (
    generation_id, user_id, terminal_kind, status, event_payload, rendered_payload,
    recipient_email, recipient_display_name, idempotency_key, last_error,
    sent_at, terminal_at
  ) values
    (
      v_active_generation, v_user_id, 'completed', 'pending',
      jsonb_build_object('generationId', v_active_generation), jsonb_build_object('html', '<p>active</p>'),
      'active@example.test', 'Active Recipient', 'retention/active', 'active error', null, null
    ),
    (
      v_sent_generation, v_user_id, 'completed', 'sent',
      jsonb_build_object('generationId', v_sent_generation), jsonb_build_object('html', '<p>sent</p>'),
      'sent@example.test', 'Sent Recipient', 'retention/sent', 'sent detail',
      v_now - interval '31 days', v_now - interval '31 days'
    ),
    (
      v_unknown_kept_generation, v_user_id, 'failed', 'delivery_unknown',
      jsonb_build_object('generationId', v_unknown_kept_generation), jsonb_build_object('html', '<p>unknown kept</p>'),
      'unknown-kept@example.test', 'Unknown Kept', 'retention/unknown-kept', 'unknown detail',
      null, v_now - interval '89 days'
    ),
    (
      v_unknown_redacted_generation, v_user_id, 'failed', 'delivery_unknown',
      jsonb_build_object('generationId', v_unknown_redacted_generation), jsonb_build_object('html', '<p>unknown redacted</p>'),
      'unknown-redacted@example.test', 'Unknown Redacted', 'retention/unknown-redacted', 'unknown detail',
      null, v_now - interval '91 days'
    ),
    (
      v_deleted_generation, v_user_id, 'completed', 'sent',
      jsonb_build_object('generationId', v_deleted_generation), jsonb_build_object('html', '<p>deleted</p>'),
      'deleted@example.test', 'Deleted Recipient', 'retention/deleted', 'deleted detail',
      v_now - interval '366 days', v_now - interval '366 days'
    );

  insert into public.styling_notification_outbox (
    styling_session_id, user_id, terminal_kind, status, event_payload, rendered_payload,
    recipient_email, recipient_display_name, idempotency_key, last_error,
    sent_at, terminal_at
  ) values (
    v_styling_session, v_user_id, 'completed', 'sent',
    jsonb_build_object('sessionId', v_styling_session), jsonb_build_object('html', '<p>styling</p>'),
    'styling@example.test', 'Styling Recipient', 'retention/styling', 'styling detail',
    v_now - interval '31 days', v_now - interval '31 days'
  );

  v_result := private.apply_notification_outbox_retention(100, v_now);
  if (v_result ->> 'generationRedacted')::integer <> 3
     or (v_result ->> 'stylingRedacted')::integer <> 1
     or (v_result ->> 'generationDeleted')::integer <> 1 then
    raise exception 'unexpected retention result: %', v_result;
  end if;

  select count(*) into v_count
    from public.generation_notification_outbox
   where generation_id = v_active_generation
     and rendered_payload is not null
     and recipient_email = 'active@example.test';
  if v_count <> 1 then
    raise exception 'active payload was redacted';
  end if;

  select count(*) into v_count
    from public.generation_notification_outbox
   where generation_id = v_sent_generation
     and payload_redacted_at = v_now
     and event_payload = '{}'::jsonb
     and rendered_payload is null
     and recipient_email is null
     and recipient_display_name is null
     and last_error is null;
  if v_count <> 1 then
    raise exception '30-day sent payload was not redacted';
  end if;

  select count(*) into v_count
    from public.generation_notification_outbox
   where generation_id = v_unknown_kept_generation
     and payload_redacted_at is null
     and rendered_payload is not null;
  if v_count <> 1 then
    raise exception '89-day delivery_unknown payload was redacted too early';
  end if;

  select count(*) into v_count
    from public.generation_notification_outbox
   where generation_id = v_unknown_redacted_generation
     and payload_redacted_at = v_now
     and rendered_payload is null;
  if v_count <> 1 then
    raise exception '91-day delivery_unknown payload was not redacted';
  end if;

  select count(*) into v_count
    from public.generation_notification_outbox
   where generation_id = v_deleted_generation;
  if v_count <> 0 then
    raise exception '365-day metadata was not deleted';
  end if;

  select count(*) into v_count
    from public.styling_notification_outbox
   where styling_session_id = v_styling_session
     and payload_redacted_at = v_now
     and rendered_payload is null
     and recipient_email is null;
  if v_count <> 1 then
    raise exception 'styling payload was not redacted';
  end if;

  if has_function_privilege('anon', 'public.apply_notification_outbox_retention(integer,timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_notification_outbox_retention(integer,timestamp with time zone)', 'execute')
     or not has_function_privilege('service_role', 'public.apply_notification_outbox_retention(integer,timestamp with time zone)', 'execute') then
    raise exception 'retention function privileges are not service-role only';
  end if;
end;
$$;

rollback;
