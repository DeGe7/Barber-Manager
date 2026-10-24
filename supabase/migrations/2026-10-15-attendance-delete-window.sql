begin;

alter table public.appointments
  add column if not exists attendance_recorded_at timestamptz;

update public.appointments as appointment
   set attendance_recorded_at = appointment.created_at
 where appointment.attendance_recorded_at is null
   and (
     appointment.status = 'completed'
     or (
       appointment.status = 'confirmed'
       and (appointment.date || ' ' || appointment.time)::timestamp
         <= timezone('America/Sao_Paulo', clock_timestamp())
     )
   );

create or replace function public.enforce_attendance_delete_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_attendance_at timestamptz;
  v_is_attendance boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' or new.attendance_recorded_at is not null then
      new.attendance_recorded_at := clock_timestamp();
    else
      new.attendance_recorded_at := null;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.attendance_recorded_at is not null then
      new.attendance_recorded_at := old.attendance_recorded_at;
    elsif new.status = 'completed' and old.status is distinct from 'completed' then
      new.attendance_recorded_at := clock_timestamp();
    elsif old.status = 'completed' then
      new.attendance_recorded_at := old.created_at;
    elsif old.status = 'confirmed'
      and (old.date || ' ' || old.time)::timestamp <= timezone('America/Sao_Paulo', clock_timestamp()) then
      new.attendance_recorded_at := old.created_at;
    elsif new.attendance_recorded_at is not null then
      new.attendance_recorded_at := clock_timestamp();
    else
      new.attendance_recorded_at := null;
    end if;
    return new;
  else
    if auth.role() = 'service_role' then
      return old;
    end if;

    v_attendance_at := old.attendance_recorded_at;
    v_is_attendance := v_attendance_at is not null or old.status = 'completed';
    if not v_is_attendance and old.status = 'confirmed' then
      v_is_attendance :=
        (old.date || ' ' || old.time)::timestamp <= timezone('America/Sao_Paulo', clock_timestamp());
    end if;

    if v_is_attendance then
      v_attendance_at := coalesce(v_attendance_at, old.created_at);
      if v_attendance_at <= clock_timestamp() - interval '24 hours' then
        raise exception using
          errcode = 'P0001',
          message = 'attendance_delete_window_expired';
      end if;
    end if;

    return old;
  end if;
end;
$$;

revoke all on function public.enforce_attendance_delete_window()
  from public, anon, authenticated;

drop trigger if exists appointments_attendance_delete_window on public.appointments;
create trigger appointments_attendance_delete_window
before insert or update or delete on public.appointments
for each row execute function public.enforce_attendance_delete_window();

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-15.4')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';

commit;
