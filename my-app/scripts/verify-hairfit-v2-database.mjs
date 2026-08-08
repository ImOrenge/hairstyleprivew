#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function localDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--databaseUrl must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("--databaseUrl must use postgres:// or postgresql://");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("HairFit V2 database verification is restricted to local PostgreSQL");
  }
  return url.toString();
}

const databaseUrl = localDatabaseUrl(argValue("databaseUrl", process.env.LOCAL_DATABASE_URL ?? ""));

function psqlArgs(sql) {
  return ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "--command", sql];
}

function runSql(sql, label) {
  const result = spawnSync("psql", psqlArgs(sql), { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${(result.stderr || result.stdout || "psql failed").trim()}`);
  }
  console.log(`passed ${label}`);
  return result.stdout.trim();
}

function runSqlConcurrent(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", psqlArgs(sql), { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

runSql(String.raw`
do $$
declare
  table_name text;
  protected_count integer := 0;
begin
  foreach table_name in array array[
    'product_offerings_v2','product_prices_v2','customer_entitlement_grants_v2',
    'entitlement_consumptions_v2','analysis_evidence_v2','personal_color_evidence_v2',
    'preview_boards_v2','preview_variants_v2','generation_attempts_v2',
    'style_selection_snapshots_v2','consultation_shortlists_v2','salon_brief_versions_v2',
    'actual_services_v2','aftercare_programs_v2','fashion_preview_sets_v2',
    'hairfit_v2_reconciliation_runs','hairfit_v2_domain_events'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = table_name
         and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'RLS is not enabled and forced for %', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'browser role can read %', table_name;
    end if;
    protected_count := protected_count + 1;
  end loop;
  if protected_count <> 17 then raise exception 'unexpected protected table count'; end if;
  if has_function_privilege('anon','public.consume_entitlement_v2(text,text,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.consume_entitlement_v2(text,text,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.consume_entitlement_v2(text,text,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.attach_generation_to_consultation_v2(text,uuid,uuid,integer,boolean)','EXECUTE') then
    raise exception 'entitlement RPC privilege mismatch';
  end if;
  if exists (
    select 1
      from pg_constraint constraint_row
      join pg_class relation_row on relation_row.oid=constraint_row.conrelid
      join pg_namespace namespace_row on namespace_row.oid=relation_row.relnamespace
     where constraint_row.contype='f'
       and namespace_row.nspname='public'
       and (relation_row.relname like '%_v2'
            or relation_row.relname='hairfit_v2_domain_events')
       and not exists (
         select 1 from pg_index index_row
          where index_row.indrelid=constraint_row.conrelid
            and index_row.indisvalid
            and (index_row.indkey::smallint[])[0:cardinality(constraint_row.conkey)-1]=constraint_row.conkey
       )
  ) then
    raise exception 'a HairFit V2 foreign key is missing a left-prefix index';
  end if;
  if to_regclass('public.idx_consultation_sessions_v2_entitlement_grant') is null
     or to_regclass('public.idx_consultation_sessions_v2_analysis_evidence') is null
     or to_regclass('public.idx_consultation_sessions_v2_preview_board') is null
     or to_regclass('public.idx_consultation_sessions_v2_selection') is null
     or to_regclass('public.idx_consultation_sessions_v2_source_generation') is null then
    raise exception 'consultation aggregate FK indexes are incomplete';
  end if;
end
$$;
`, "RLS and RPC privilege assertions");

runSql(String.raw`
delete from public.users where id in ('hairfit_v2_db_smoke_a','hairfit_v2_db_smoke_b');

insert into public.users(id,email,display_name,credits) values
  ('hairfit_v2_db_smoke_a','hairfit-v2-db-smoke-a@example.test','HairFit V2 DB smoke A',11),
  ('hairfit_v2_db_smoke_b','hairfit-v2-db-smoke-b@example.test','HairFit V2 DB smoke B',7);

insert into public.consultation_sessions(id,user_id,idempotency_key,lifecycle_state,version,current_stage,snapshot) values
  ('00000000-0000-4000-8000-000000000101','hairfit_v2_db_smoke_a','db-smoke-session-101','draft',1,'discovery','{}'),
  ('00000000-0000-4000-8000-000000000102','hairfit_v2_db_smoke_a','db-smoke-session-102','draft',1,'discovery','{}'),
  ('00000000-0000-4000-8000-000000000103','hairfit_v2_db_smoke_a','db-smoke-session-103','draft',1,'discovery','{}'),
  ('00000000-0000-4000-8000-000000000104','hairfit_v2_db_smoke_a','db-smoke-session-104','preview_board_queued',3,'previews','{}');

insert into public.generations(id,user_id,original_image_path,prompt_used,status,credits_used)
values (
  '00000000-0000-4000-8000-000000000190','hairfit_v2_db_smoke_a',
  'db-smoke/original.webp','protected fixture prompt','queued',5
);

do $$
begin
  begin
    insert into public.consultation_sessions(user_id,idempotency_key,current_stage,snapshot)
    values ('hairfit_v2_db_smoke_a','db-smoke-session-101','discovery','{}');
    raise exception 'duplicate consultation idempotency key was accepted';
  exception when unique_violation then null;
  end;
end
$$;

do $$
declare linked jsonb; replayed jsonb; conflict jsonb;
begin
  linked := public.attach_generation_to_consultation_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000190',1,true
  );
  replayed := public.attach_generation_to_consultation_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000190',2,true
  );
  conflict := public.attach_generation_to_consultation_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000190',1,true
  );
  if linked->>'lifecycleState' <> 'photo_validated'
     or (linked->>'version')::integer <> 2
     or not (replayed->>'replayed')::boolean
     or conflict->>'state' <> 'conflict' then
    raise exception 'atomic consultation photo link contract failed';
  end if;
  if (select consultation_id <> '00000000-0000-4000-8000-000000000101'
        from public.generations where id='00000000-0000-4000-8000-000000000190') then
    raise exception 'generation side of consultation link was not committed';
  end if;
  begin
    perform public.attach_generation_to_consultation_v2(
      'hairfit_v2_db_smoke_b','00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000190',null,false
    );
    raise exception 'foreign owner linked a consultation';
  exception when no_data_found then null;
  end;
end
$$;

insert into public.customer_entitlement_grants_v2(
  id,user_id,offering_id,offering_key,offering_version,capability_snapshot,
  quantity_granted,source,source_transaction_id
)
select
  '00000000-0000-4000-8000-000000000201','hairfit_v2_db_smoke_a',id,
  offering_key,version,capabilities,1,'manual','db-smoke-idempotency'
from public.product_offerings_v2
where offering_key='hair_decision_once' and status='active';

do $$
declare first_call jsonb; replay_call jsonb; first_restore jsonb; replay_restore jsonb;
begin
  first_call := public.consume_entitlement_v2(
    'hairfit_v2_db_smoke_a','hair_decision_once',
    '00000000-0000-4000-8000-000000000101','db-smoke-consume-101'
  );
  replay_call := public.consume_entitlement_v2(
    'hairfit_v2_db_smoke_a','hair_decision_once',
    '00000000-0000-4000-8000-000000000101','db-smoke-consume-101'
  );
  if (first_call->>'replayed')::boolean or not (replay_call->>'replayed')::boolean then
    raise exception 'consume replay contract failed';
  end if;
  begin
    perform public.consume_entitlement_v2(
      'hairfit_v2_db_smoke_a','hair_decision_once',
      '00000000-0000-4000-8000-000000000102','db-smoke-consume-101'
    );
    raise exception 'idempotency collision was accepted';
  exception when unique_violation then null;
  end;
  first_restore := public.restore_entitlement_v2(
    'hairfit_v2_db_smoke_a',(first_call->>'id')::uuid
  );
  replay_restore := public.restore_entitlement_v2(
    'hairfit_v2_db_smoke_a',(first_call->>'id')::uuid
  );
  if (first_restore->>'replayed')::boolean or not (replay_restore->>'replayed')::boolean then
    raise exception 'restore replay contract failed';
  end if;
  if (select quantity_consumed <> 0 or status <> 'active'
        from public.customer_entitlement_grants_v2
       where id='00000000-0000-4000-8000-000000000201') then
    raise exception 'restore did not return the entitlement';
  end if;
end
$$;

update public.customer_entitlement_grants_v2
   set status='revoked'
 where id='00000000-0000-4000-8000-000000000201';

insert into public.customer_entitlement_grants_v2(
  id,user_id,offering_id,offering_key,offering_version,capability_snapshot,
  quantity_granted,source,source_transaction_id
)
select
  '00000000-0000-4000-8000-000000000202','hairfit_v2_db_smoke_a',id,
  offering_key,version,capabilities,1,'manual','db-smoke-concurrency'
from public.product_offerings_v2
where offering_key='hair_decision_once' and status='active';
`, "entitlement and consultation fixtures");

const concurrentConsumptionCalls = await Promise.all([
  runSqlConcurrent(String.raw`select public.consume_entitlement_v2('hairfit_v2_db_smoke_a','hair_decision_once','00000000-0000-4000-8000-000000000102','db-smoke-concurrent-a');`),
  runSqlConcurrent(String.raw`select public.consume_entitlement_v2('hairfit_v2_db_smoke_a','hair_decision_once','00000000-0000-4000-8000-000000000103','db-smoke-concurrent-b');`),
]);
if (concurrentConsumptionCalls.filter((result) => result.status === 0).length !== 1) {
  throw new Error(`concurrent entitlement consume expected one success: ${JSON.stringify(concurrentConsumptionCalls)}`);
}

runSql(String.raw`
do $$
begin
  if (select count(*) <> 1 from public.entitlement_consumptions_v2
       where grant_id='00000000-0000-4000-8000-000000000202') then
    raise exception 'concurrent consume created an unexpected number of rows';
  end if;
  if (select quantity_consumed <> 1 or status <> 'exhausted'
        from public.customer_entitlement_grants_v2
       where id='00000000-0000-4000-8000-000000000202') then
    raise exception 'concurrent consume violated grant totals';
  end if;
end
$$;

insert into public.customer_entitlement_grants_v2(
  id,user_id,offering_id,offering_key,offering_version,capability_snapshot,
  quantity_granted,source,source_transaction_id
)
select
  '00000000-0000-4000-8000-000000000203','hairfit_v2_db_smoke_a',id,
  offering_key,version,capabilities,1,'manual','db-smoke-board'
from public.product_offerings_v2
where offering_key='hair_decision_once' and status='active';

select public.consume_entitlement_v2(
  'hairfit_v2_db_smoke_a','hair_decision_once',
  '00000000-0000-4000-8000-000000000104','db-smoke-board-consume'
);

insert into public.preview_boards_v2(
  id,consultation_id,user_id,strategy_version,state,entitlement_consumption_id
)
select
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000104',
  'hairfit_v2_db_smoke_a','hairfit-consultation-prompt-v2','generating',id
from public.entitlement_consumptions_v2
where consultation_id='00000000-0000-4000-8000-000000000104';

insert into public.preview_variants_v2(
  id,board_id,user_id,slot,strategy_bucket,intent,status
)
select
  gen_random_uuid(),'00000000-0000-4000-8000-000000000401','hairfit_v2_db_smoke_a',slot,
  case when slot <= 3 then 'face_balance'
       when slot <= 6 then 'image_change'
       else 'manageability' end,
  'db-smoke-slot-' || slot,'generating'
from generate_series(1,9) slot;

insert into public.generation_attempts_v2(
  id,preview_variant_id,user_id,attempt_number,provider,model,
  prompt_policy_version,prompt_hash,prompt_input_snapshot,slot_intent,status
)
select
  gen_random_uuid(),id,'hairfit_v2_db_smoke_a',1,'fixture','fixture-model',
  'hairfit-consultation-prompt-v2',repeat(md5(id::text),2),'{}',intent,'generating'
from public.preview_variants_v2
where board_id='00000000-0000-4000-8000-000000000401';

do $$
declare attempt record; result jsonb;
begin
  for attempt in
    select a.id,v.slot
      from public.generation_attempts_v2 a
      join public.preview_variants_v2 v on v.id=a.preview_variant_id
     where v.board_id='00000000-0000-4000-8000-000000000401'
     order by v.slot
  loop
    result := public.accept_generation_attempt_v2(
      'hairfit_v2_db_smoke_a',attempt.id,
      'db-smoke/output-' || attempt.slot || '.webp',
      'db-smoke-fingerprint-' || attempt.slot,10,100
    );
  end loop;
  if result->>'state' <> 'board_ready' or (result->>'acceptedCount')::integer <> 9 then
    raise exception 'ninth accepted attempt did not ready the board';
  end if;
  if (select state <> 'ready' or accepted_count <> 9
        from public.preview_boards_v2
       where id='00000000-0000-4000-8000-000000000401') then
    raise exception 'accepted-nine board invariant failed';
  end if;
  if (select state <> 'consumed' from public.entitlement_consumptions_v2
       where consultation_id='00000000-0000-4000-8000-000000000104') then
    raise exception 'accepted-nine board did not settle its entitlement';
  end if;
end
$$;

do $$
declare session_version integer; variant_id uuid; first_snapshot jsonb; second_snapshot jsonb;
begin
  select version into session_version from public.consultation_sessions
   where id='00000000-0000-4000-8000-000000000104';
  select id into variant_id from public.preview_variants_v2
   where board_id='00000000-0000-4000-8000-000000000401' and slot=1;
  first_snapshot := public.draft_style_selection_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104',variant_id,
    '00000000-0000-4000-8000-000000000701',1,session_version,
    '{"id":"00000000-0000-4000-8000-000000000701","fixture":"first"}'
  );
  select id into variant_id from public.preview_variants_v2
   where board_id='00000000-0000-4000-8000-000000000401' and slot=2;
  second_snapshot := public.draft_style_selection_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104',variant_id,
    '00000000-0000-4000-8000-000000000702',2,(first_snapshot->>'version')::integer,
    '{"id":"00000000-0000-4000-8000-000000000702","fixture":"second"}'
  );
end
$$;
`, "concurrency and accepted-nine fixtures");

const selectionVersion = runSql(String.raw`
select version from public.consultation_sessions
 where id='00000000-0000-4000-8000-000000000104';
`, "selection version lookup").split(/\s+/).find((value) => /^\d+$/.test(value));
if (!selectionVersion) throw new Error("selection version lookup did not return an integer");

const concurrentConfirmCalls = await Promise.all([
  runSqlConcurrent(String.raw`select public.confirm_style_selection_v2('hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000702',${selectionVersion});`),
  runSqlConcurrent(String.raw`select public.confirm_style_selection_v2('hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000702',${selectionVersion});`),
]);
if (concurrentConfirmCalls.some((result) => result.status !== 0)) {
  throw new Error(`idempotent concurrent confirm failed: ${JSON.stringify(concurrentConfirmCalls)}`);
}

runSql(String.raw`
do $$
declare replay jsonb;
begin
  if (select count(*) <> 1 from public.style_selection_snapshots_v2
       where consultation_id='00000000-0000-4000-8000-000000000104' and status='confirmed') then
    raise exception 'selection confirmation is not unique';
  end if;
  if (select selected_snapshot_id <> '00000000-0000-4000-8000-000000000702'
             or lifecycle_state <> 'selection_confirmed'
        from public.consultation_sessions
       where id='00000000-0000-4000-8000-000000000104') then
    raise exception 'consultation did not lock the confirmed snapshot';
  end if;
  replay := public.confirm_style_selection_v2(
    'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000702',1
  );
  if not (replay->>'replayed')::boolean then raise exception 'confirm replay was not idempotent'; end if;
  begin
    perform public.confirm_style_selection_v2(
      'hairfit_v2_db_smoke_a','00000000-0000-4000-8000-000000000104',
      '00000000-0000-4000-8000-000000000701',
      (select version from public.consultation_sessions where id='00000000-0000-4000-8000-000000000104')
    );
    raise exception 'superseded snapshot bypassed the confirmation lock';
  exception when check_violation then null;
  end;
end
$$;

delete from public.users where id='hairfit_v2_db_smoke_a';

do $$
begin
  if exists(select 1 from public.consultation_sessions where user_id='hairfit_v2_db_smoke_a')
     or exists(select 1 from public.generation_attempts_v2 where user_id='hairfit_v2_db_smoke_a')
     or exists(select 1 from public.style_selection_snapshots_v2 where user_id='hairfit_v2_db_smoke_a') then
    raise exception 'user-owned V2 data did not cascade on account deletion';
  end if;
end
$$;
`, "selection lock, replay, and deletion assertions");

console.log("HairFit V2 database behavior verification passed.");
