alter table public.organization_invitations
  add column if not exists resend_email_id text,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_updated_at timestamptz;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_email_delivery_status_check;

alter table public.organization_invitations
  add constraint organization_invitations_email_delivery_status_check
  check (
    email_delivery_status is null or email_delivery_status in (
      'sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained'
    )
  );

create unique index if not exists invitations_resend_email_id_idx
  on public.organization_invitations (resend_email_id)
  where resend_email_id is not null;

create or replace function public.record_resend_invitation_email_event(
  p_email_id text,
  p_status text,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained')
     or p_event_at is null then
    raise exception 'invalid invitation email event';
  end if;

  update public.organization_invitations
     set email_delivery_status = p_status,
         email_delivery_updated_at = p_event_at
   where resend_email_id = p_email_id
     and (email_delivery_updated_at is null or email_delivery_updated_at <= p_event_at)
     and coalesce(email_delivery_status, '') not in (
       'delivered', 'bounced', 'failed', 'complained'
     );

  return found;
end;
$$;

revoke all on function public.record_resend_invitation_email_event(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_resend_invitation_email_event(text, text, timestamptz)
  to service_role;

update public.schema_metadata
   set value = '2026-10-16.2',
       updated_at = now()
 where key = 'app_schema_version';
