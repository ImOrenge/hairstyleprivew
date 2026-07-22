#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const STAGING_WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_EPHEMERAL_FIXTURES";
const DEFAULT_WORKERS = 8;

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redact(value, secrets) {
  let redacted = String(value || "");
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.replaceAll(secret, "[redacted]");
  }
  return redacted
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]")
    .replace(/password=[^\s]+/gi, "password=[redacted]");
}

function databaseTarget(rawValue, environment, expectedHost, confirmation) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("--databaseUrl must be a valid PostgreSQL URL");
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error("--databaseUrl must use postgres:// or postgresql://");
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (environment === "local") {
    if (!isLocal) throw new Error("local smoke is restricted to a loopback PostgreSQL host");
  } else if (environment === "staging") {
    if (isLocal) throw new Error("staging smoke cannot target a loopback PostgreSQL host");
    if (!expectedHost) throw new Error("--expectedHost is required for staging smoke");
    if (url.hostname.toLowerCase() !== expectedHost.trim().toLowerCase()) {
      throw new Error("staging database host does not match --expectedHost");
    }
    if (confirmation !== STAGING_WRITE_CONFIRMATION) {
      throw new Error(`staging smoke requires --confirmStagingWrite=${STAGING_WRITE_CONFIRMATION}`);
    }
    if (url.searchParams.get("sslmode") === "disable") {
      throw new Error("staging smoke refuses a database URL with sslmode=disable");
    }
  } else {
    throw new Error("--environment must be local or staging");
  }

  return {
    databaseUrl: url.toString(),
    databaseName: url.pathname.replace(/^\//, "") || "postgres",
    hostFingerprint: createHash("sha256").update(url.hostname).digest("hex").slice(0, 16),
    password: decodeURIComponent(url.password || ""),
    username: decodeURIComponent(url.username || ""),
    hostname: url.hostname,
  };
}

function psqlArgs(databaseUrl) {
  return [
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "-v",
    "ON_ERROR_STOP=1",
    "--dbname",
    databaseUrl,
    "-f",
    "-",
  ];
}

function sqlSession(source) {
  return String.raw`
set statement_timeout = '15s';
set lock_timeout = '5s';
set application_name = 'hairfit_generation_notification_staging_smoke';
${source}
`;
}

function runSql(databaseUrl, source, environment, secrets) {
  const result = spawnSync("psql", psqlArgs(databaseUrl), {
    encoding: "utf8",
    env: {
      ...process.env,
      PGSSLMODE: environment === "staging" ? "require" : "disable",
    },
    input: sqlSession(source),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "psql failed", secrets).trim());
  }
  return result.stdout.trim();
}

function runSqlAsync(databaseUrl, source, environment, secrets) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("psql", psqlArgs(databaseUrl), {
      env: {
        ...process.env,
        PGSSLMODE: environment === "staging" ? "require" : "disable",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(redact(stderr || stdout || `psql exited ${code}`, secrets).trim()));
        return;
      }
      resolvePromise(stdout.trim());
    });
    child.stdin.end(sqlSession(source));
  });
}

function parseJsonRow(output) {
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
  return line ? JSON.parse(line) : null;
}

function assertCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function markdown(summary) {
  const checkRows = summary.checks.length
    ? summary.checks.map((check) => `| ${check.name} | ${check.status} | ${check.detail} |`).join("\n")
    : "| runner | failed | 실행 전 구성 검증 실패 |";
  return `# Generation notification staging DB concurrency smoke\n\n` +
    `- status: ${summary.status}\n` +
    `- environment: ${summary.environment}\n` +
    `- startedAt: ${summary.startedAt}\n` +
    `- finishedAt: ${summary.finishedAt}\n` +
    `- durationMs: ${summary.durationMs}\n` +
    `- workers: ${summary.workers}\n` +
    `- databaseHostFingerprint: ${summary.databaseHostFingerprint || "unavailable"}\n` +
    `- databaseName: ${summary.databaseName || "unavailable"}\n` +
    `- serverVersion: ${summary.serverVersion || "unavailable"}\n\n` +
    `| Check | Status | Evidence |\n| --- | --- | --- |\n${checkRows}\n` +
    (summary.error ? `\n## Error\n\n${summary.error}\n` : "");
}

function writeArtifacts(artifactDir, summary) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    resolve(artifactDir, "generation-notification-staging-smoke.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(artifactDir, "generation-notification-staging-smoke.md"),
    markdown(summary),
    "utf8",
  );
}

const startedAt = new Date();
const environment = argValue("environment", process.env.GENERATION_NOTIFICATION_DB_ENVIRONMENT || "");
const workers = Math.min(32, parsePositiveInteger(argValue("workers", String(DEFAULT_WORKERS)), DEFAULT_WORKERS));
const artifactDir = resolve(
  repoRoot,
  argValue("artifactDir", ".artifacts/generation-notification-staging"),
);
const summary = {
  schemaVersion: 1,
  status: "failed",
  environment: environment || "unknown",
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  durationMs: null,
  workers,
  databaseHostFingerprint: null,
  databaseName: null,
  serverVersion: null,
  checks: [],
  cleanup: "not_started",
  error: null,
};

let target;
let fixtureUserId;
try {
  target = databaseTarget(
    argValue("databaseUrl", process.env.STAGING_DATABASE_URL || process.env.LOCAL_DATABASE_URL || ""),
    environment,
    argValue("expectedHost", process.env.STAGING_DATABASE_EXPECTED_HOST || ""),
    argValue("confirmStagingWrite", ""),
  );
  summary.databaseHostFingerprint = target.hostFingerprint;
  summary.databaseName = target.databaseName;
  const secrets = [target.databaseUrl, target.password, target.username, target.hostname];
  const runId = randomUUID();
  fixtureUserId = `notification_staging_smoke_${runId}`;
  const fixtureEmail = `${runId}@generation-notification-smoke.invalid`;
  const generationId = randomUUID();

  const probe = parseJsonRow(runSql(target.databaseUrl, String.raw`
select json_build_object(
  'serverVersion', current_setting('server_version'),
  'outboxTable', to_regclass('public.generation_notification_outbox') is not null,
  'enqueueFunction', to_regprocedure('public.enqueue_generation_completion_notification_outbox(uuid,text)') is not null,
  'claimFunction', to_regprocedure('public.claim_generation_completion_notification_outbox(integer,uuid,integer)') is not null,
  'prepareFunction', to_regprocedure('public.prepare_generation_completion_notification_outbox(uuid,uuid,jsonb)') is not null,
  'beginFunction', to_regprocedure('public.begin_generation_completion_notification_provider_attempt(uuid,uuid)') is not null,
  'finishFunction', to_regprocedure('public.finish_generation_completion_notification_outbox(uuid,uuid,text)') is not null
)::text;
`, environment, secrets));
  assertCheck(probe?.outboxTable && probe?.enqueueFunction && probe?.claimFunction && probe?.prepareFunction && probe?.beginFunction && probe?.finishFunction, "required generation notification schema is missing");
  summary.serverVersion = probe.serverVersion;
  summary.checks.push({ name: "schema_probe", status: "passed", detail: "outbox and five fenced RPCs are present" });

  runSql(target.databaseUrl, String.raw`
begin;
insert into public.users (id, email, display_name, credits)
values (${sqlLiteral(fixtureUserId)}, ${sqlLiteral(fixtureEmail)}, 'Notification staging smoke', 0);
insert into public.generations (
  id, user_id, original_image_path, prompt_used, options, status,
  model_provider, completion_notification_status
) values (
  ${sqlLiteral(generationId)}::uuid,
  ${sqlLiteral(fixtureUserId)},
  ${sqlLiteral(`staging-smoke/${runId}/original.webp`)},
  'generation notification staging smoke',
  jsonb_build_object(
    'recommendationSet', jsonb_build_object(
      'variants', jsonb_build_array(jsonb_build_object(
        'id', 'staging-smoke-variant',
        'label', 'Staging smoke',
        'status', 'completed',
        'outputUrl', 'https://example.invalid/staging-smoke.webp'
      ))
    )
  ),
  'completed',
  'test',
  'pending'
);
commit;
`, environment, secrets);
  summary.cleanup = "pending";

  const enqueueStartedAt = Date.now();
  const enqueueResults = await Promise.all(
    Array.from({ length: workers }, () => runSqlAsync(target.databaseUrl, String.raw`
select json_build_object(
  'outboxId', item.outbox_id,
  'status', item.outbox_status,
  'idempotencyKey', item.outbox_idempotency_key
)::text
from public.enqueue_generation_completion_notification_outbox(
  ${sqlLiteral(generationId)}::uuid,
  'email'
) as item;
`, environment, secrets)),
  );
  const enqueueRows = enqueueResults.map(parseJsonRow).filter(Boolean);
  const enqueueIds = new Set(enqueueRows.map((row) => row.outboxId));
  const enqueueState = parseJsonRow(runSql(target.databaseUrl, String.raw`
select json_build_object(
  'count', count(*),
  'distinctIdempotencyKeys', count(distinct idempotency_key)
)::text
from public.generation_notification_outbox
where generation_id = ${sqlLiteral(generationId)}::uuid;
`, environment, secrets));
  assertCheck(enqueueRows.length === workers, `expected ${workers} enqueue receipts, received ${enqueueRows.length}`);
  assertCheck(enqueueIds.size === 1, `concurrent enqueue returned ${enqueueIds.size} outbox IDs`);
  assertCheck(Number(enqueueState?.count) === 1 && Number(enqueueState?.distinctIdempotencyKeys) === 1, "concurrent enqueue created duplicate outbox rows or idempotency keys");
  summary.checks.push({
    name: "concurrent_enqueue",
    status: "passed",
    detail: `${workers} sessions converged on one outbox row in ${Date.now() - enqueueStartedAt}ms`,
  });

  const claimStartedAt = Date.now();
  const claimResults = await Promise.all(
    Array.from({ length: workers }, () => runSqlAsync(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.claim_generation_completion_notification_outbox(
  1,
  ${sqlLiteral(generationId)}::uuid,
  600
) as item;
`, environment, secrets)),
  );
  const claimRows = claimResults.map(parseJsonRow).filter(Boolean);
  assertCheck(claimRows.length === 1, `expected one concurrent claim winner, received ${claimRows.length}`);
  const claim = claimRows[0];
  assertCheck(claim.outbox_attempt_count === 1 && claim.outbox_lease_token, "claim winner did not receive the first fenced lease");
  summary.checks.push({
    name: "concurrent_claim",
    status: "passed",
    detail: `one of ${workers} sessions received the lease; losers remained no-op in ${Date.now() - claimStartedAt}ms`,
  });

  const renderedPayload = {
    to: fixtureEmail,
    from: "HairFit <noreply@hairfit.beauty>",
    subject: "Generation staging smoke",
    html: "<p>Generation staging smoke</p>",
    text: "Generation staging smoke",
    source: "generation-notification-staging-smoke",
    idempotencyKey: `generation-completed/${generationId}`,
  };
  const wrongLeaseToken = randomUUID();
  const wrongPrepare = parseJsonRow(runSql(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.prepare_generation_completion_notification_outbox(
  ${sqlLiteral(claim.outbox_id)}::uuid,
  ${sqlLiteral(wrongLeaseToken)}::uuid,
  ${sqlLiteral(JSON.stringify(renderedPayload))}::jsonb
) as item;
`, environment, secrets));
  assertCheck(wrongPrepare?.applied === false, "a stale lease token prepared the provider payload");

  const prepared = parseJsonRow(runSql(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.prepare_generation_completion_notification_outbox(
  ${sqlLiteral(claim.outbox_id)}::uuid,
  ${sqlLiteral(claim.outbox_lease_token)}::uuid,
  ${sqlLiteral(JSON.stringify(renderedPayload))}::jsonb
) as item;
`, environment, secrets));
  assertCheck(prepared?.applied === true, "the authoritative lease could not freeze the provider payload");

  const wrongBegin = parseJsonRow(runSql(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.begin_generation_completion_notification_provider_attempt(
  ${sqlLiteral(claim.outbox_id)}::uuid,
  ${sqlLiteral(wrongLeaseToken)}::uuid
) as item;
`, environment, secrets));
  assertCheck(wrongBegin?.applied === false, "a stale lease token began a provider attempt");
  const begun = parseJsonRow(runSql(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.begin_generation_completion_notification_provider_attempt(
  ${sqlLiteral(claim.outbox_id)}::uuid,
  ${sqlLiteral(claim.outbox_lease_token)}::uuid
) as item;
`, environment, secrets));
  assertCheck(begun?.applied === true, "the authoritative lease could not begin the provider attempt");
  summary.checks.push({ name: "lease_fencing", status: "passed", detail: "stale prepare/begin tokens were no-op; authoritative token froze one payload" });

  const finishStartedAt = Date.now();
  const finishResults = await Promise.all(
    Array.from({ length: workers }, (_, index) => runSqlAsync(target.databaseUrl, String.raw`
select row_to_json(item)::text
from public.finish_generation_completion_notification_outbox(
  ${sqlLiteral(claim.outbox_id)}::uuid,
  ${sqlLiteral(claim.outbox_lease_token)}::uuid,
  ${sqlLiteral(`staging-smoke-provider-${index + 1}`)}
) as item;
`, environment, secrets)),
  );
  const finishRows = finishResults.map(parseJsonRow).filter(Boolean);
  const appliedFinishes = finishRows.filter((row) => row.applied === true);
  assertCheck(finishRows.length === workers, `expected ${workers} finish receipts, received ${finishRows.length}`);
  assertCheck(appliedFinishes.length === 1, `expected one applied finish, received ${appliedFinishes.length}`);

  const finalState = parseJsonRow(runSql(target.databaseUrl, String.raw`
select json_build_object(
  'outboxCount', count(*),
  'status', min(status),
  'attemptCount', min(attempt_count),
  'sentRows', count(*) filter (where status = 'sent' and sent_at is not null and terminal_at is not null),
  'payloadFrozen', bool_and(rendered_payload = ${sqlLiteral(JSON.stringify(renderedPayload))}::jsonb),
  'generationMirror', (
    select generation.completion_notification_status
      from public.generations as generation
     where generation.id = ${sqlLiteral(generationId)}::uuid
  )
)::text
from public.generation_notification_outbox
where generation_id = ${sqlLiteral(generationId)}::uuid;
`, environment, secrets));
  assertCheck(Number(finalState?.outboxCount) === 1, "final state contains duplicate outbox rows");
  assertCheck(finalState?.status === "sent" && Number(finalState?.sentRows) === 1, "final outbox state is not exactly one sent row");
  assertCheck(Number(finalState?.attemptCount) === 1, "concurrent finish changed the attempt count");
  assertCheck(finalState?.payloadFrozen === true, "rendered provider payload changed after preparation");
  assertCheck(finalState?.generationMirror === "sent", "legacy generation notification mirror did not settle to sent");
  summary.checks.push({
    name: "concurrent_finish",
    status: "passed",
    detail: `one of ${workers} finish calls settled sent; payload and generation mirror stayed immutable in ${Date.now() - finishStartedAt}ms`,
  });

  runSql(target.databaseUrl, String.raw`
delete from public.users where id = ${sqlLiteral(fixtureUserId)};
`, environment, secrets);
  summary.cleanup = "completed";
  const residue = parseJsonRow(runSql(target.databaseUrl, String.raw`
select json_build_object(
  'users', count(*) filter (where app_user.id = ${sqlLiteral(fixtureUserId)}),
  'generations', (select count(*) from public.generations where user_id = ${sqlLiteral(fixtureUserId)}),
  'outbox', (
    select count(*)
      from public.generation_notification_outbox as outbox
      join public.generations as generation on generation.id = outbox.generation_id
     where generation.user_id = ${sqlLiteral(fixtureUserId)}
  )
)::text
from public.users as app_user;
`, environment, secrets));
  assertCheck(Number(residue?.users) === 0 && Number(residue?.generations) === 0 && Number(residue?.outbox) === 0, "ephemeral staging fixtures were not fully removed");
  summary.checks.push({ name: "fixture_cleanup", status: "passed", detail: "ephemeral user, generation, and outbox rows were removed" });
  summary.status = "passed";
} catch (error) {
  const secrets = target
    ? [target.databaseUrl, target.password, target.username, target.hostname]
    : [];
  summary.error = redact(error instanceof Error ? error.message : error, secrets);
  if (target && fixtureUserId && summary.cleanup !== "completed") {
    try {
      runSql(target.databaseUrl, `delete from public.users where id = ${sqlLiteral(fixtureUserId)};`, environment, secrets);
      summary.cleanup = "completed_after_failure";
    } catch (cleanupError) {
      summary.cleanup = "failed";
      summary.error += `\nCleanup failed: ${redact(cleanupError instanceof Error ? cleanupError.message : cleanupError, secrets)}`;
    }
  }
} finally {
  const finishedAt = new Date();
  summary.finishedAt = finishedAt.toISOString();
  summary.durationMs = finishedAt.getTime() - startedAt.getTime();
  writeArtifacts(artifactDir, summary);
  console.log(`Generation notification staging smoke ${summary.status}. Artifact: ${artifactDir}`);
  if (summary.error) console.error(summary.error);
}

if (summary.status !== "passed") process.exitCode = 1;
