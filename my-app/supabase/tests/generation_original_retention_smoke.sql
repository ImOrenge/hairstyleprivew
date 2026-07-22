\set ON_ERROR_STOP on

begin;

do $$
declare
  v_now timestamptz := '2026-07-18 00:00:00+00';
  v_user_id text := 'original_retention_smoke_user';
  v_partial uuid := '73000000-0000-4000-8000-000000000001';
  v_completed uuid := '73000000-0000-4000-8000-000000000002';
  v_expired uuid := '73000000-0000-4000-8000-000000000003';
  v_not_expired uuid := '73000000-0000-4000-8000-000000000004';
  v_default_deadline uuid := '73000000-0000-4000-8000-000000000005';
  v_draft uuid := '74000000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_claim jsonb;
  v_cleanup_id uuid;
  v_lease_token uuid;
  v_completed_cleanup_id uuid;
  v_count integer;
begin
  insert into public.users (id, email, display_name, credits)
  values (v_user_id, 'original-retention@example.test', 'Original Retention Smoke', 100);

  insert into public.generations (
    id, user_id, original_image_path, generated_image_path, prompt_used,
    options, status, credits_used, model_provider, accepted_at,
    original_retention_expires_at
  ) values
    (
      v_partial, v_user_id, 'originals/smoke/partial.webp', 'generated/partial.webp', 'partial',
      '{"recommendationSet":{"variants":[{"id":"ok","status":"completed"},{"id":"retry","status":"failed"}]}}'::jsonb,
      'completed', 10, 'test', v_now - interval '1 hour', v_now + interval '23 hours'
    ),
    (
      v_completed, v_user_id, 'originals/smoke/completed.webp', 'generated/completed.webp', 'completed',
      '{"recommendationSet":{"variants":[{"id":"ok-1","status":"completed"},{"id":"ok-2","status":"completed"}]}}'::jsonb,
      'completed', 10, 'test', v_now - interval '1 hour', v_now + interval '23 hours'
    ),
    (
      v_expired, v_user_id, 'originals/smoke/expired.webp', null, 'expired',
      '{"recommendationSet":{"variants":[{"id":"retry","status":"failed"}]}}'::jsonb,
      'failed', 0, 'test', v_now - interval '25 hours', v_now - interval '1 hour'
    ),
    (
      v_not_expired, v_user_id, 'originals/smoke/not-expired.webp', null, 'not expired',
      '{"recommendationSet":{"variants":[{"id":"retry","status":"failed"}]}}'::jsonb,
      'failed', 0, 'test', v_now - interval '1 hour', v_now + interval '23 hours'
    ),
    (
      v_default_deadline, v_user_id, 'originals/smoke/default-deadline.webp', null, 'default deadline',
      '{"recommendationSet":{"variants":[{"id":"retry","status":"failed"}]}}'::jsonb,
      'failed', 0, 'test', v_now - interval '1 hour', null
    );

  select count(*) into v_count
    from public.generations
   where id = v_default_deadline
     and original_retention_expires_at = accepted_at + interval '24 hours';
  if v_count <> 1 then raise exception 'accepted original did not receive the 24-hour default deadline'; end if;

  v_result := public.abandon_generation_retry(v_partial, v_user_id, v_now);
  v_cleanup_id := (v_result ->> 'cleanupId')::uuid;
  if v_cleanup_id is null
     or v_result ->> 'cleanupStatus' <> 'queued'
     or (v_result ->> 'retryAvailable')::boolean then
    raise exception 'retry abandonment did not atomically queue cleanup: %', v_result;
  end if;

  select count(*) into v_count
    from public.generations
   where id = v_partial
     and original_cleanup_status = 'cleanup_queued'
     and original_cleanup_reason = 'retry_abandoned'
     and retry_abandoned_at = v_now;
  if v_count <> 1 then raise exception 'generation retry was not closed'; end if;

  v_result := public.abandon_generation_retry(v_partial, v_user_id, v_now + interval '1 minute');
  if not (v_result ->> 'idempotentReplay')::boolean
     or (v_result ->> 'cleanupId')::uuid <> v_cleanup_id then
    raise exception 'retry abandonment was not idempotent: %', v_result;
  end if;

  begin
    perform public.abandon_generation_retry(v_not_expired, 'another-user', v_now);
    raise exception 'wrong-owner abandonment unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'wrong-owner abandonment unexpectedly succeeded' then raise; end if;
  end;

  v_result := public.request_generation_original_cleanup(
    v_completed, v_user_id, 'all_variants_completed', v_now
  );
  v_completed_cleanup_id := (v_result ->> 'cleanupId')::uuid;
  if v_result ->> 'cleanupStatus' <> 'queued' then
    raise exception 'all-completed cleanup was not queued: %', v_result;
  end if;

  select value into v_claim
    from public.claim_generation_original_cleanups(1, v_completed_cleanup_id, 600) as claimed(value);
  v_lease_token := (v_claim ->> 'leaseToken')::uuid;
  v_result := public.retry_generation_original_cleanup(
    v_completed_cleanup_id, v_lease_token, 'synthetic Storage outage', 0
  );
  if v_result ->> 'status' <> 'retry' then
    raise exception 'failed Storage deletion was not rescheduled: %', v_result;
  end if;

  begin
    perform public.request_generation_original_cleanup(
      v_not_expired, v_user_id, 'retention_expired', v_now
    );
    raise exception 'early retention cleanup unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'early retention cleanup unexpectedly succeeded' then raise; end if;
  end;

  v_result := public.queue_expired_generation_originals(100, v_now);
  if (v_result ->> 'queuedCount')::integer <> 1 then
    raise exception 'expired original was not queued exactly once: %', v_result;
  end if;

  insert into public.generation_upload_drafts (
    id, user_id, client_request_id, original_image_path, content_type,
    byte_size, checksum_sha256, state, uploaded_at, expires_at
  ) values (
    v_draft, v_user_id, '74000000-0000-4000-8000-000000000002',
    'originals/smoke/expired-draft.webp', 'image/webp', 100,
    repeat('a', 64), 'ready', v_now - interval '25 hours', v_now - interval '1 hour'
  );

  v_result := public.expire_generation_upload_drafts(100, v_now);
  if (v_result ->> 'expiredCount')::integer <> 1
     or (v_result ->> 'enqueuedCount')::integer <> 1 then
    raise exception 'draft expiry and cleanup were not atomic: %', v_result;
  end if;

  select value into v_claim
    from public.claim_generation_original_cleanups(1, v_cleanup_id, 600) as claimed(value);
  v_lease_token := (v_claim ->> 'leaseToken')::uuid;
  if v_lease_token is null then raise exception 'cleanup was not claimed with a lease: %', v_claim; end if;

  begin
    perform public.finish_generation_original_cleanup(v_cleanup_id, gen_random_uuid());
    raise exception 'stale lease unexpectedly finished cleanup';
  exception
    when others then
      if sqlerrm = 'stale lease unexpectedly finished cleanup' then raise; end if;
  end;

  v_result := public.finish_generation_original_cleanup(v_cleanup_id, v_lease_token);
  if not (v_result ->> 'finished')::boolean then
    raise exception 'valid cleanup lease did not finish: %', v_result;
  end if;

  select count(*) into v_count
    from public.generations
   where id = v_partial
     and original_cleanup_status = 'deleted'
     and original_image_path = 'deleted-original://' || v_partial::text
     and original_deleted_at is not null;
  if v_count <> 1 then raise exception 'finished cleanup did not mark generation deleted'; end if;

  begin
    update public.generations
       set options = jsonb_set(
         options,
         '{recommendationSet,variants,1,status}',
         '"generating"'::jsonb
       )
     where id = v_partial;
    raise exception 'retry mutation after cleanup unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'retry mutation after cleanup unexpectedly succeeded' then raise; end if;
  end;

  if has_function_privilege('anon', 'public.abandon_generation_retry(uuid,text,timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'public.abandon_generation_retry(uuid,text,timestamp with time zone)', 'execute')
     or not has_function_privilege('service_role', 'public.abandon_generation_retry(uuid,text,timestamp with time zone)', 'execute') then
    raise exception 'retry abandonment privileges are not service-role only';
  end if;

  select count(*) into v_count
    from pg_class
   where oid = 'public.generation_original_cleanup_outbox'::regclass
     and relrowsecurity
     and relforcerowsecurity;
  if v_count <> 1 then raise exception 'cleanup outbox RLS is not enabled and forced'; end if;
end;
$$;

rollback;
