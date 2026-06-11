-- AI assistant conversation persistence.
-- content holds raw Anthropic message blocks (tool_use / tool_result /
-- thinking included) so a conversation can be replayed to the API verbatim.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq int not null,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  display jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create index if not exists ai_messages_conversation_seq_idx
  on public.ai_messages (conversation_id, seq);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "own conversations" on public.ai_conversations;
create policy "own conversations" on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own messages" on public.ai_messages;
create policy "own messages" on public.ai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
