begin;

create or replace function public.create_or_get_client_by_phone(
  p_id text,
  p_name text,
  p_email text,
  p_whatsapp text,
  p_birthday text,
  p_source text,
  p_source_other text,
  p_interest text,
  p_created_at text,
  p_initial_visit jsonb
)
returns public.clients
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_organization_id();
  v_phone_digits text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_normalized_phone text;
  v_client public.clients;
begin
  if auth.uid() is null then
    raise exception 'Faça login para cadastrar clientes.';
  end if;
  if v_organization_id is null then
    raise exception 'Nenhum estabelecimento ativo foi encontrado.';
  end if;
  if not public.has_permission('clientes') then
    raise exception 'Você não tem permissão para cadastrar clientes.';
  end if;
  if p_initial_visit is not null and jsonb_typeof(p_initial_visit) <> 'object' then
    raise exception 'A visita inicial do cliente é inválida.';
  end if;

  v_normalized_phone := case
    when left(v_phone_digits, 2) = '55' and length(v_phone_digits) in (12, 13)
      then substr(v_phone_digits, 3)
    else v_phone_digits
  end;

  if v_normalized_phone <> '' then
    perform pg_advisory_xact_lock(
      hashtextextended(v_organization_id::text || ':' || v_normalized_phone, 0)
    );

    select clients.*
      into v_client
      from public.clients
     where clients.organization_id = v_organization_id
       and case
         when left(regexp_replace(coalesce(clients.whatsapp, ''), '[^0-9]', '', 'g'), 2) = '55'
           and length(regexp_replace(coalesce(clients.whatsapp, ''), '[^0-9]', '', 'g')) in (12, 13)
           then substr(regexp_replace(coalesce(clients.whatsapp, ''), '[^0-9]', '', 'g'), 3)
         else regexp_replace(coalesce(clients.whatsapp, ''), '[^0-9]', '', 'g')
       end = v_normalized_phone
     order by clients.created_at asc, clients.id asc
     limit 1;

    if found then
      if p_initial_visit is not null
        and nullif(p_initial_visit->>'id', '') is not null
        and not exists (
          select 1
            from jsonb_array_elements(coalesce(v_client.visits, '[]'::jsonb)) as existing_visit(value)
           where existing_visit.value->>'id' = p_initial_visit->>'id'
        ) then
        update public.clients as existing_client
           set visits = coalesce(existing_client.visits, '[]'::jsonb) || jsonb_build_array(p_initial_visit)
         where existing_client.id = v_client.id
           and existing_client.organization_id = v_organization_id
        returning existing_client.* into v_client;
      end if;
      return v_client;
    end if;
  end if;

  insert into public.clients (
    id, name, email, whatsapp, birthday, source, source_other,
    interest, created_at, visits, organization_id
  ) values (
    p_id,
    p_name,
    coalesce(p_email, ''),
    coalesce(p_whatsapp, ''),
    p_birthday,
    p_source,
    p_source_other,
    coalesce(p_interest, 'barbearia'),
    coalesce(nullif(p_created_at, '')::timestamptz, now()),
    case when p_initial_visit is null then '[]'::jsonb else jsonb_build_array(p_initial_visit) end,
    v_organization_id
  )
  returning clients.* into v_client;

  return v_client;
end;
$$;

revoke all on function public.create_or_get_client_by_phone(text, text, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_or_get_client_by_phone(text, text, text, text, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.create_or_get_client_by_phone(text, text, text, text, text, text, text, text, text, jsonb)
  to service_role;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-15.3')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
