begin;

alter table public.organization_invitations
  add column if not exists invited_by_name text;

update public.organization_invitations invitation
   set invited_by_name = coalesce(
     nullif(btrim(profile.full_name), ''),
     nullif(btrim(profile.email), ''),
     'Usuário'
   )
  from public.profiles profile
 where profile.id = invitation.invited_by
   and invitation.invited_by_name is null;

create or replace function public.record_organization_invitation_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Usuário')
    into new.invited_by_name
    from public.profiles
   where id = new.invited_by;
  new.invited_by_name := coalesce(new.invited_by_name, 'Usuário');
  return new;
end;
$$;

revoke all on function public.record_organization_invitation_creator()
  from public, anon, authenticated;

drop trigger if exists organization_invitations_record_creator
  on public.organization_invitations;
create trigger organization_invitations_record_creator
before insert on public.organization_invitations
for each row execute function public.record_organization_invitation_creator();

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-15.2')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
