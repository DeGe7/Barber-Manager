begin;

alter table public.organization_invitations
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null,
  add column if not exists revoked_by_name text;

create or replace function public.record_organization_invitation_revocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_by := auth.uid();
    if new.revoked_by is not null then
      select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Usuário')
        into new.revoked_by_name
        from public.profiles
       where id = new.revoked_by;
      new.revoked_by_name := coalesce(new.revoked_by_name, 'Usuário');
    else
      new.revoked_by_name := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.record_organization_invitation_revocation()
  from public, anon, authenticated;

drop trigger if exists organization_invitations_record_revocation
  on public.organization_invitations;
create trigger organization_invitations_record_revocation
before update of revoked_at on public.organization_invitations
for each row execute function public.record_organization_invitation_revocation();

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-15.1')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
