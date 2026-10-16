-- Apply after deploying the updated Plaid Edge Function.
-- The old direct deletion path could delete a user without revoking Plaid Items.
drop function if exists public.delete_flow_account();
