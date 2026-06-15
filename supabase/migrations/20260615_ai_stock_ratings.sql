-- Per-user AI Buy/Hold/Sell verdicts surfaced on the Research tab.
-- One latest rating per (user, symbol); written when the user runs an
-- "ask Finance AI" deep dive. RLS scopes rows to their owner.

create table if not exists public.ai_stock_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  rating text not null check (rating in ('BUY','HOLD','SELL')),
  rationale text,
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.ai_stock_ratings enable row level security;

create policy "own ratings select" on public.ai_stock_ratings
  for select using (user_id = auth.uid());
create policy "own ratings insert" on public.ai_stock_ratings
  for insert with check (user_id = auth.uid());
create policy "own ratings update" on public.ai_stock_ratings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own ratings delete" on public.ai_stock_ratings
  for delete using (user_id = auth.uid());
