-- Editable spreadsheet artifacts the AI can read and live-edit on the Research/
-- AI Analyst chat surface. `data` holds the parsed grid model:
--   { sheets: [{ name, columns: string[], rows: (string|number|null)[][] }], activeSheet }
-- RLS scopes every artifact to its owner.

create table if not exists public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid,
  name text,
  kind text not null default 'spreadsheet',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_artifacts enable row level security;

create policy "own artifacts select" on public.ai_artifacts
  for select using (user_id = auth.uid());
create policy "own artifacts insert" on public.ai_artifacts
  for insert with check (user_id = auth.uid());
create policy "own artifacts update" on public.ai_artifacts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own artifacts delete" on public.ai_artifacts
  for delete using (user_id = auth.uid());

create index if not exists ai_artifacts_user_updated_idx
  on public.ai_artifacts (user_id, updated_at desc);
