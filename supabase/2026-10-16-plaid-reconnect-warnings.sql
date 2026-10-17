-- Apply this once to the existing Supabase project before deploying the
-- updated Plaid functions. New projects get the column from plaid-setup.sql.
alter table public.plaid_connections
    add column if not exists reconnect_required boolean not null default false;
