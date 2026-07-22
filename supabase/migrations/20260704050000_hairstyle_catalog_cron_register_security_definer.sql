-- Let service_role call the registration helper while the helper performs
-- pg_cron schedule changes with the migration owner's privileges.

alter function public.register_hairstyle_catalog_rotation_cron(text, text, text, text)
  security definer;
