begin;

alter table public.appointments
  add column if not exists client_id text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'appointments_client_id_fkey'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;
end
$$;

create index if not exists appointments_client_id_idx
  on public.appointments (client_id)
  where client_id is not null;

commit;
