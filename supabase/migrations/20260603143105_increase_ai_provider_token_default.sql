alter table public.ai_provider_configs
alter column max_tokens set default 1800;

update public.ai_provider_configs
set max_tokens = 1800
where status = 'active'
  and max_tokens < 1800;

notify pgrst, 'reload schema';
