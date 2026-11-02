-- Account type chosen at registration (002_account_type)
-- Safe on existing databases (incl. Supabase) and on re-runs.

alter table users add column if not exists account_type text;

update users set account_type = 'researcher' where account_type is null;

alter table users alter column account_type set default 'researcher';
alter table users alter column account_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_type_check'
  ) then
    alter table users add constraint users_account_type_check
      check (account_type in ('researcher','reviewer','organizer'));
  end if;
end $$;
