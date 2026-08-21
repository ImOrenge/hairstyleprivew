-- P53: bind immutable report snapshots to the complete Hair/Fashion source projection.

alter table public.consultation_report_snapshots_v2
  add column if not exists source_fingerprint text not null default 'legacy-v1';

alter table public.consultation_report_snapshots_v2
  drop constraint if exists consultation_report_snapshots_v2_source_fingerprint_check;

alter table public.consultation_report_snapshots_v2
  add constraint consultation_report_snapshots_v2_source_fingerprint_check
    check (length(source_fingerprint) between 8 and 128);

drop index if exists public.uq_consultation_report_snapshots_v2_source_version;

create unique index uq_consultation_report_snapshots_v2_source_version
  on public.consultation_report_snapshots_v2 (
    consultation_id,
    consultation_version,
    result_version,
    profile,
    view_model_version,
    renderer_version,
    source_fingerprint
  );

create index if not exists idx_consultation_report_snapshots_v2_fingerprint
  on public.consultation_report_snapshots_v2 (user_id, consultation_id, source_fingerprint, created_at desc);

comment on column public.consultation_report_snapshots_v2.source_fingerprint is
  'Immutable P53 source projection fingerprint. A Fashion 3 to 6 to 9 expansion creates a new report snapshot without overwriting older exports.';
