-- Equity Research Report feature.
--
-- 1. App-GLOBAL fundamentals cache (NOT per-user — financial statements are
--    public reference data). Authenticated users may READ; only the service
--    role (which bypasses RLS) WRITES, from the get-fundamentals edge function.
-- 2. SEC ticker -> CIK map cache (so we don't refetch the ~1MB company_tickers
--    file per request).
-- 3. The report artifact reuses public.ai_artifacts with kind='report'; its
--    `data` jsonb holds { status, model, blocks, sources, meta } (no schema
--    change needed — `kind` is already a free-text column).

create table if not exists public.fundamentals_cache (
  ticker text primary key,
  data jsonb not null,            -- normalized Fundamentals bundle
  source_summary jsonb,           -- per-field provenance / data-quality
  fetched_at timestamptz not null default now()
);

alter table public.fundamentals_cache enable row level security;

-- Read-only to any signed-in user. No insert/update/delete policy exists, so
-- writes are possible only via the service-role key (RLS-exempt).
create policy "fundamentals readable by authenticated"
  on public.fundamentals_cache for select
  to authenticated using (true);

create index if not exists fundamentals_cache_fetched_idx
  on public.fundamentals_cache (fetched_at desc);

create table if not exists public.sec_ticker_map (
  ticker text primary key,
  cik text not null,              -- zero-padded 10-digit CIK
  title text,
  updated_at timestamptz not null default now()
);

alter table public.sec_ticker_map enable row level security;

create policy "sec ticker map readable by authenticated"
  on public.sec_ticker_map for select
  to authenticated using (true);

-- Documentation only: the report artifact kind. ai_artifacts already exists
-- with a free-text `kind` column defaulting to 'spreadsheet'.
comment on column public.ai_artifacts.kind is
  'Artifact type: ''spreadsheet'' (editable grid) or ''report'' (equity research document: data = { status, model, blocks, sources, meta }).';
