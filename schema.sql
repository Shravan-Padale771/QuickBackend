-- Messages table
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  author text not null,
  code varchar(7) not null unique,
  message text not null,
  createdAt timestamp with time zone not null default now(),
  expiresAt timestamp with time zone not null
);

-- Helpful index for lookups by code and expiry
create index if not exists idx_messages_code on public.messages(code);
create index if not exists idx_messages_expires on public.messages(expiresAt);

-- Optional: auto purge expired rows with a daily policy (requires pg_cron or Supabase scheduled jobs)
-- In Supabase, configure a scheduled task to run:
-- delete from public.messages where expiresAt < now();