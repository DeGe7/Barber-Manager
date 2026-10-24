begin;

-- Existing appointments stay untouched; the defaults only apply to new rows.
alter table public.appointments
  add column if not exists seller_professional_id text,
  add column if not exists seller_is_company boolean not null default false;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'appointments_seller_company_check'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_seller_company_check
      check (not seller_is_company or seller_professional_id is null);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'appointments_seller_professional_id_fkey'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_seller_professional_id_fkey
      foreign key (seller_professional_id)
      references public.professionals(id)
      on delete set null;
  end if;
end
$$;

create or replace function public.validate_appointment_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.professional_id is not null and not exists (
    select 1
      from public.professionals
     where id = new.professional_id
       and organization_id = new.organization_id
  ) then
    raise exception 'appointment professional must belong to the appointment organization';
  end if;

  if new.seller_professional_id is not null and not exists (
    select 1
      from public.professionals
     where id = new.seller_professional_id
       and organization_id = new.organization_id
  ) then
    raise exception 'appointment seller must belong to the appointment organization';
  end if;

  if new.seller_is_company and new.seller_professional_id is not null then
    raise exception 'company-attributed appointments cannot have a professional seller';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_appointment_attribution() from public, anon, authenticated;

drop trigger if exists appointments_validate_attribution on public.appointments;
create trigger appointments_validate_attribution
before insert or update of professional_id, seller_professional_id, seller_is_company, organization_id
on public.appointments
for each row execute function public.validate_appointment_attribution();

update public.schema_metadata
   set value = case
         when split_part(value, '.', 1) > '2026-10-16'
           or (
             split_part(value, '.', 1) = '2026-10-16'
             and coalesce(nullif(split_part(value, '.', 2), '')::integer, 0) > 1
           )
         then value
         else '2026-10-16.1'
       end,
       updated_at = now()
 where key = 'app_schema_version';

commit;
