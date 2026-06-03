create table public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  provider_type text not null default 'openai_compatible',
  base_url text not null,
  model text not null,
  encrypted_api_key text not null,
  api_key_hint text,
  status text not null default 'disabled' check (status in ('active', 'disabled')),
  max_tokens integer not null default 900 check (max_tokens between 64 and 8192),
  temperature numeric(3,2) not null default 0.20 check (temperature >= 0 and temperature <= 2),
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('ok', 'failed')),
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_configs_name_not_blank check (btrim(provider_name) <> ''),
  constraint ai_provider_configs_base_url_not_blank check (btrim(base_url) <> ''),
  constraint ai_provider_configs_model_not_blank check (btrim(model) <> ''),
  constraint ai_provider_configs_type_supported check (provider_type = 'openai_compatible')
);

create unique index ai_provider_configs_single_active_idx
on public.ai_provider_configs ((status))
where status = 'active';

create table public.ai_settings (
  id boolean primary key default true check (id),
  weekly_prompt_limit integer not null default 5 check (weekly_prompt_limit between 0 and 1000),
  reset_timezone text not null default 'Asia/Jakarta',
  system_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id, weekly_prompt_limit, reset_timezone, system_prompt)
values (true, 5, 'Asia/Jakarta', '')
on conflict (id) do nothing;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start timestamptz not null,
  prompt text not null,
  provider_config_id uuid references public.ai_provider_configs(id) on delete set null,
  thread_id uuid references public.ai_threads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_usage_events_user_week_idx on public.ai_usage_events (user_id, week_start, created_at desc);
create index ai_provider_configs_status_updated_idx on public.ai_provider_configs (status, updated_at desc);

create trigger set_ai_provider_configs_updated_at
before update on public.ai_provider_configs
for each row execute function private.set_updated_at();

create trigger set_ai_settings_updated_at
before update on public.ai_settings
for each row execute function private.set_updated_at();

alter table public.ai_provider_configs enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_provider_configs from anon, authenticated;
revoke all on table public.ai_settings from anon, authenticated;
revoke all on table public.ai_usage_events from anon, authenticated;

grant all on table public.ai_provider_configs to service_role;
grant all on table public.ai_settings to service_role;
grant all on table public.ai_usage_events to service_role;

create policy "Service role can manage AI provider configs"
on public.ai_provider_configs
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage AI settings"
on public.ai_settings
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage AI usage"
on public.ai_usage_events
for all
to service_role
using (true)
with check (true);
