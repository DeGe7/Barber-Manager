begin;

alter table public.organization_members
  add column if not exists granted_by uuid references public.profiles(id) on delete set null,
  add column if not exists granted_by_name text,
  add column if not exists granted_at timestamptz;

create or replace function public.record_organization_member_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'gestor' and new.granted_by is not null then
    new.granted_at := now();
    select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Usuário')
      into new.granted_by_name
      from public.profiles
     where id = new.granted_by;
    new.granted_by_name := coalesce(new.granted_by_name, 'Usuário');
  end if;
  return new;
end;
$$;

revoke all on function public.record_organization_member_grant()
  from public, anon, authenticated;

drop trigger if exists organization_members_record_grant
  on public.organization_members;
create trigger organization_members_record_grant
before insert on public.organization_members
for each row execute function public.record_organization_member_grant();

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-21.2')
on conflict (key) do update
  set value = case
        when split_part(public.schema_metadata.value, '.', 1) > split_part(excluded.value, '.', 1)
          or (
            split_part(public.schema_metadata.value, '.', 1) = split_part(excluded.value, '.', 1)
            and coalesce(nullif(split_part(public.schema_metadata.value, '.', 2), '')::integer, 0)
              > coalesce(nullif(split_part(excluded.value, '.', 2), '')::integer, 0)
          )
        then public.schema_metadata.value
        else excluded.value
      end,
      updated_at = now();

commit;
