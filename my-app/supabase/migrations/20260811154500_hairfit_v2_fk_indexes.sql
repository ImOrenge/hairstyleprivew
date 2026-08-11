-- Complete left-prefix indexes for HairFit V2 lifecycle foreign keys.
-- These indexes keep parent deletes, ownership lookups, and reconciliation joins bounded.

create index if not exists idx_consultation_analysis_runs_v2_capability_task
  on public.consultation_analysis_runs_v2 (capability_task_id);

create index if not exists idx_consultation_analysis_runs_v2_source_photo
  on public.consultation_analysis_runs_v2 (source_photo_id);

create index if not exists idx_consultation_capability_results_v2_consultation
  on public.consultation_capability_results_v2 (consultation_id);

create index if not exists idx_consultation_capability_tasks_v2_consultation
  on public.consultation_capability_tasks_v2 (consultation_id);

create index if not exists idx_fashion_preview_batches_v2_capability_task
  on public.fashion_preview_batches_v2 (capability_task_id);

create index if not exists idx_fashion_preview_batches_v2_selection
  on public.fashion_preview_batches_v2 (selection_snapshot_id);

notify pgrst, 'reload schema';
