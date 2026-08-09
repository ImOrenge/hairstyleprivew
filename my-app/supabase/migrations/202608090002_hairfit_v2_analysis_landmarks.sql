-- Persist model-produced normalized face landmarks separately from derived
-- contour, hairline, and measurement layers.

alter table if exists public.analysis_evidence_v2
  add column if not exists landmarks jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.analysis_evidence_v2
    add constraint analysis_evidence_v2_landmarks_array_check
    check (jsonb_typeof(landmarks) = 'array');
exception
  when duplicate_object then null;
end
$$;

comment on column public.analysis_evidence_v2.landmarks is
  'Versioned normalized 0..1 model landmarks. Every item records detected, inferred, or user_adjusted provenance and confidence.';
