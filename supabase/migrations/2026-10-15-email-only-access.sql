begin;

create or replace function public.enforce_email_only_join_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.applicant_phone is not null then
      raise exception 'phone access requests are disabled';
    end if;
    if nullif(btrim(coalesce(new.applicant_email, '')), '') is null then
      raise exception 'applicant email is required';
    end if;
  elsif tg_op = 'UPDATE'
     and new.status = 'approved'
     and old.status is distinct from 'approved'
     and nullif(btrim(coalesce(new.applicant_email, '')), '') is null then
    raise exception 'phone access requests must be resubmitted with email';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_email_only_join_requests() from public, anon, authenticated;

drop trigger if exists organization_join_requests_email_only on public.organization_join_requests;
create trigger organization_join_requests_email_only
before insert or update of status on public.organization_join_requests
for each row
execute function public.enforce_email_only_join_requests();

create or replace function public.enforce_email_only_invitation_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.phone is not null
     and old.accepted_at is null
     and new.accepted_at is not null then
    raise exception 'phone invitations are disabled';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_email_only_invitation_acceptance() from public, anon, authenticated;

drop trigger if exists organization_invitations_email_only_acceptance on public.organization_invitations;
create trigger organization_invitations_email_only_acceptance
before update of accepted_at on public.organization_invitations
for each row
execute function public.enforce_email_only_invitation_acceptance();

drop function if exists public.create_organization_invitation_by_phone(text, text, integer);

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-15.5')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
