-- Arms used for A/B arms and diff tracking (future use)
create table if not exists public.arms(
  arm_id uuid primary key default gen_random_uuid(),
  base_prompt_version text not null,
  diff_json jsonb not null,
  sampling_json jsonb not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz default now()
);

-- Per-generation metadata (no images or PII)
create table if not exists public.generations(
  generation_id uuid primary key default gen_random_uuid(),
  arm_id uuid references public.arms(arm_id),
  prompt_version text not null,
  applied_diff_hash text not null,
  sampling_temperature float,
  top_p float,
  model text,
  procedure text,
  intensities jsonb,
  clerk_user_id text,
  offer_probability float,
  latency_ms int,
  result_ok boolean,
  created_at timestamptz default now()
);

-- Feedback thumbs: 1 (up) / 0 (down)
create table if not exists public.feedback(
  generation_id uuid primary key references public.generations(generation_id),
  rating int not null check (rating in (0,1)),
  reason text,
  clerk_user_id text,
  created_at timestamptz default now()
);

-- Arm statistics cache for bandit algorithm
create table if not exists public.arm_stats(
  arm_id uuid primary key references public.arms(arm_id),
  shows int not null default 0,
  thumbs_up int not null default 0,
  thumbs_down int not null default 0,
  ctr float generated always as (case when shows > 0 then thumbs_up::float / shows else 0 end) stored,
  wilson_lower float,
  updated_at timestamptz default now()
);

create index if not exists idx_generations_created on public.generations(created_at);
create index if not exists idx_generations_arm on public.generations(arm_id);
create index if not exists idx_feedback_created on public.feedback(created_at);
create index if not exists idx_arm_stats_ctr on public.arm_stats(ctr desc);
create index if not exists idx_arm_stats_shows on public.arm_stats(shows asc);

-- RLS: deny all by default; service role will insert/select
alter table public.arms enable row level security;
alter table public.generations enable row level security;
alter table public.feedback enable row level security;
alter table public.arm_stats enable row level security;

create policy "deny all arms" on public.arms for all using (false) with check (false);
create policy "deny all generations" on public.generations for all using (false) with check (false);
create policy "deny all feedback" on public.feedback for all using (false) with check (false);
create policy "deny all arm_stats" on public.arm_stats for all using (false) with check (false);

-- Seed initial v1 baseline arm
insert into public.arms (base_prompt_version, diff_json, sampling_json, active, notes)
values (
  'v1',
  '{"changes": []}',
  '{"temperature": 0.7, "top_p": 0.9}',
  true,
  'Baseline v1 arm - no modifications'
) on conflict do nothing;

-- Initialize stats for baseline arm
insert into public.arm_stats (arm_id, shows, thumbs_up, thumbs_down)
select arm_id, 0, 0, 0 
from public.arms 
where base_prompt_version = 'v1' and diff_json = '{"changes": []}'
on conflict do nothing;

-- RPC functions for atomic arm_stats updates
create or replace function increment_arm_shows(target_arm_id uuid)
returns void
language plpgsql
as $$
begin
  insert into public.arm_stats (arm_id, shows)
  values (target_arm_id, 1)
  on conflict (arm_id) 
  do update set 
    shows = arm_stats.shows + 1,
    updated_at = now();
end;
$$;

create or replace function increment_arm_thumbs_up(target_arm_id uuid)
returns void
language plpgsql
as $$
begin
  update public.arm_stats 
  set 
    thumbs_up = thumbs_up + 1,
    updated_at = now()
  where arm_id = target_arm_id;
end;
$$;

create or replace function increment_arm_thumbs_down(target_arm_id uuid)
returns void
language plpgsql
as $$
begin
  update public.arm_stats 
  set 
    thumbs_down = thumbs_down + 1,
    updated_at = now()
  where arm_id = target_arm_id;
end;
$$;


