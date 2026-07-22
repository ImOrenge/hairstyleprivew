#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(appDir, "supabase", "migrations");
const durableGenerationDependencyOrder = [
  "20260715103000_generation_variant_attempt_leases.sql",
  "20260715134451_generation_notification_outbox.sql",
  "20260715150000_generation_durable_acceptance.sql",
  "20260715160000_generation_credit_reservation_settlement.sql",
];

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
    throw new Error("fresh-chain verification is restricted to a local PostgreSQL database");
  }
  return url.toString();
}

function runSql(databaseUrl, sql, label) {
  const result = spawnSync(
    "psql",
    ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-f", "-"],
    { encoding: "utf8", input: sql, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "psql failed").trim();
    throw new Error(`${label} failed\n${detail}`);
  }
}

function withoutHostedOnlyExtensions(source) {
  return source
    .replace(/^create extension if not exists pg_net schema extensions;\s*$/gim, "-- local fresh-chain: pg_net is Supabase-hosted")
    .replace(/^create extension if not exists pg_cron;\s*$/gim, "-- local fresh-chain: pg_cron is Supabase-hosted");
}

function assertMigrationOrder(migrations, requiredOrder) {
  let previousIndex = -1;

  for (const migration of requiredOrder) {
    const index = migrations.indexOf(migration);
    if (index < 0) {
      throw new Error(`required migration missing from fresh chain: ${migration}`);
    }
    if (index <= previousIndex) {
      throw new Error(`durable generation migration order is invalid at: ${migration}`);
    }
    previousIndex = index;
  }
}

const databaseUrl = localDatabaseUrl(argValue("databaseUrl", process.env.LOCAL_DATABASE_URL ?? ""));
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

assertMigrationOrder(migrations, durableGenerationDependencyOrder);
console.log(`verified durable generation migration order: ${durableGenerationDependencyOrder.join(" -> ")}`);

runSql(databaseUrl, String.raw`
do $$
begin
  if exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
  ) then
    raise exception 'fresh-chain target must not contain public tables';
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.role() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') $$;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.email() returns text
language sql stable as $$ select auth.jwt() ->> 'email' $$;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
`, "Supabase compatibility bootstrap");

for (const migration of migrations) {
  const source = withoutHostedOnlyExtensions(readFileSync(resolve(migrationsDir, migration), "utf8"));
  runSql(databaseUrl, source, migration);
  console.log(`applied ${migration}`);
}

runSql(databaseUrl, String.raw`
do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'users',
    'generations',
    'generation_upload_drafts',
    'styling_sessions',
    'user_hair_records',
    'account_deletion_tombstones'
  ]
  loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'required table missing after fresh chain: %', required_table;
    end if;
  end loop;
end
$$;
`, "fresh-chain schema assertions");

console.log(`Supabase fresh-chain verification passed (${migrations.length} migrations).`);
