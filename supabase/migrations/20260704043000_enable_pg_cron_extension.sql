-- Enable pg_cron so hairstyle catalog rotation jobs can be registered.
-- Supabase installs pg_cron into pg_catalog and exposes the cron schema.

create extension if not exists pg_cron;
