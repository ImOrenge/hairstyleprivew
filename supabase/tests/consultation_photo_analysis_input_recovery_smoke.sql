begin;

select plan(8);

select has_function(
  'public',
  'queue_consultation_photo_analysis_v2',
  array['uuid', 'text', 'uuid', 'text', 'jsonb'],
  'photo analysis queue RPC keeps its public signature'
);

select ok(
  pg_get_functiondef('public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)'::regprocedure)
    ~* 'expectedVersion.*faceEvidence.*photo.*draftId',
  'queue validates the complete executable input snapshot'
);

select ok(
  pg_get_functiondef('public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)'::regprocedure)
    ~* 'source_photo_id.*<>.*p_source_photo_id.*PHOTO_ANALYSIS_SOURCE_CONFLICT',
  'idempotent reuse is fenced to the same source photo'
);

select ok(
  pg_get_functiondef('public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)'::regprocedure)
    ~* 'state = ''completed'' then.*return v_existing',
  'completed jobs remain unchanged'
);

select ok(
  pg_get_functiondef('public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)'::regprocedure)
    ~* 'attempt_count = 0',
  'manual recovery rearms the same job with a fresh attempt budget'
);

select ok(
  pg_get_functiondef('public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)'::regprocedure)
    ~* 'fencing_token = run.fencing_token \+ 1',
  'rearming and superseding invalidate stale workers'
);

select ok(
  not has_function_privilege('authenticated', 'public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated clients cannot queue analysis directly'
);

select ok(
  has_function_privilege('service_role', 'public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb)', 'EXECUTE'),
  'service role can queue validated analysis work'
);

select * from finish();
rollback;
