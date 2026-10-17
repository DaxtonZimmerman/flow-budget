-- Run before deploying the private production pilot functions.
-- All existing Items were created in Sandbox and stay there.
alter table public.plaid_connections
    add column if not exists environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production'));

create unique index if not exists plaid_one_production_item_per_user
    on public.plaid_connections(user_id) where environment = 'production';
