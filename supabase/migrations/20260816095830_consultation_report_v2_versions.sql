-- Allow immutable V1 and V2 report snapshots to coexist for the same consultation result.

alter table public.consultation_report_snapshots_v2
  add column if not exists view_model_version integer not null default 1,
  add column if not exists renderer_version text not null default 'report-pdf-v1';

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.consultation_report_snapshots_v2'::regclass
      and constraint_row.contype = 'u'
      and (
        pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (consultation_id, consultation_version, result_version, profile)'
        or pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, content_sha256, profile)'
      )
  loop
    execute format('alter table public.consultation_report_snapshots_v2 drop constraint %I', v_constraint);
  end loop;
end;
$$;

create unique index if not exists uq_consultation_report_snapshots_v2_source_version
  on public.consultation_report_snapshots_v2 (
    consultation_id,
    consultation_version,
    result_version,
    profile,
    view_model_version,
    renderer_version
  );

create unique index if not exists uq_consultation_report_snapshots_v2_content_version
  on public.consultation_report_snapshots_v2 (
    user_id,
    content_sha256,
    profile,
    view_model_version,
    renderer_version
  );

alter table public.consultation_report_snapshots_v2
  drop constraint if exists consultation_report_snapshots_v2_view_model_version_check,
  drop constraint if exists consultation_report_snapshots_v2_renderer_version_check;

alter table public.consultation_report_snapshots_v2
  add constraint consultation_report_snapshots_v2_view_model_version_check
    check (view_model_version > 0),
  add constraint consultation_report_snapshots_v2_renderer_version_check
    check (length(renderer_version) between 3 and 120);

comment on column public.consultation_report_snapshots_v2.view_model_version is
  'Version of the immutable public report view model. V1 and V2 rows may coexist.';
comment on column public.consultation_report_snapshots_v2.renderer_version is
  'Versioned PDF renderer identity included in snapshot idempotency and integrity.';
