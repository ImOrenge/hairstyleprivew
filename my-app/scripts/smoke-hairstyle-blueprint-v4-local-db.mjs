#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
    throw new Error("blueprint v4 DB smoke is restricted to a local PostgreSQL database");
  }
  return url.toString();
}

const databaseUrl = localDatabaseUrl(argValue("databaseUrl", process.env.LOCAL_DATABASE_URL ?? ""));
const sql = String.raw`
begin;

do $$
declare
  required_column text;
begin
  foreach required_column in array array[
    'style_family', 'variant_key', 'primary_texture', 'compatible_texture_tags',
    'primary_strand_thickness', 'compatible_strand_thickness_tags', 'primary_condition',
    'compatible_condition_tags', 'required_services', 'service_constraints',
    'maintenance_level', 'introduced_in'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hairstyle_catalog' and column_name = required_column
    ) then
      raise exception 'blueprint v4 column missing: %', required_column;
    end if;
  end loop;
end
$$;

do $$
begin
  if (select prosecdef from pg_proc where oid = 'public.get_active_hairstyle_catalog(text)'::regprocedure) then
    raise exception 'get_active_hairstyle_catalog must remain security invoker';
  end if;
  if has_function_privilege('anon', 'public.get_active_hairstyle_catalog(text)', 'execute') then
    raise exception 'anon must not execute get_active_hairstyle_catalog';
  end if;
  if not has_function_privilege('authenticated', 'public.get_active_hairstyle_catalog(text)', 'execute') then
    raise exception 'authenticated must execute get_active_hairstyle_catalog';
  end if;
  if not has_function_privilege('service_role', 'public.get_active_hairstyle_catalog(text)', 'execute') then
    raise exception 'service_role must execute get_active_hairstyle_catalog';
  end if;
end
$$;

insert into public.hairstyle_catalog_cycles(cycle_id, status, market, finished_at, item_count, source_summary)
values ('00000000-0000-4000-8000-000000000101', 'succeeded', 'kr', now(), 1, '{}');

insert into public.hairstyle_catalog(
  id, slug, name_ko, market, length_bucket, silhouette, texture, bang_type, prompt_template,
  negative_prompt, source_cycle_id, style_targets, style_family, variant_key, primary_texture,
  compatible_texture_tags, primary_strand_thickness, compatible_strand_thickness_tags,
  primary_condition, compatible_condition_tags, required_services, service_constraints,
  maintenance_level, introduced_in
) values (
  '00000000-0000-4000-8000-000000000102', 'fresh-chain-v4-smoke', 'DB 검증', 'kr', 'short',
  'round', 'straight', 'none', 'prompt', 'negative', '00000000-0000-4000-8000-000000000101',
  array['female']::public.member_style_target[], 'smoke-family', 'smoke-variant', 'straight',
  array['straight'], 'fine', array['fine'], 'colored', array['colored'], array['cut'],
  array['professional_assessment'], 'low', 'expansion-a'
);

insert into public.hairstyle_catalog_active_cycles(
  market, active_cycle_id, expires_at, rotation_period, rotation_seed, last_rebuild_cycle_id, last_rebuild_status
) values (
  'kr', '00000000-0000-4000-8000-000000000101', now() + interval '7 days', 'weekly', 'smoke',
  '00000000-0000-4000-8000-000000000101', 'succeeded'
);

set local role authenticated;
do $$
declare payload jsonb;
begin
  payload := public.get_active_hairstyle_catalog('kr');
  if payload ->> 'activeCycleId' <> '00000000-0000-4000-8000-000000000101' then
    raise exception 'active cycle missing from RPC';
  end if;
  if payload #>> '{items,0,primary_strand_thickness}' <> 'fine' then
    raise exception 'strand thickness missing from RPC';
  end if;
  if payload #>> '{items,0,primary_condition}' <> 'colored' then
    raise exception 'condition missing from RPC';
  end if;
end
$$;
reset role;

do $$
begin
  begin
    update public.hairstyle_catalog
       set primary_strand_thickness = 'invalid'
     where slug = 'fresh-chain-v4-smoke';
    raise exception 'strand thickness constraint did not reject an invalid value';
  exception when check_violation then
    null;
  end;
end
$$;

rollback;
`;

const result = spawnSync(
  "psql",
  ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-f", "-"],
  { encoding: "utf8", input: sql, maxBuffer: 4 * 1024 * 1024 },
);
if (result.status !== 0) {
  throw new Error((result.stderr || result.stdout || "psql failed").trim());
}

console.log("Hairstyle blueprint v4 local DB smoke passed (columns, constraints, grants, RLS-backed RPC fields).");
