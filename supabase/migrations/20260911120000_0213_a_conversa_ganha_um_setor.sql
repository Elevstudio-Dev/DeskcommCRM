-- 0213 — a conversa ganha um SETOR, antes de (ou em vez de) um responsável.
--
-- ## O pedido
--
-- "Em vez de atendente, ter setores. Uma loja de informática: o setor de
-- assistência, o setor financeiro, o setor da recepção." A conversa deixa de ir
-- para UMA pessoa e passa a ir para um GRUPO de pessoas — e cada pessoa vê a
-- fila do seu grupo.
--
-- ## O que entra
--
--   sectors            — o setor: nome, cor (a paleta dos marcadores), posição.
--   sector_members     — quem está em qual setor (uma pessoa pode estar em vários).
--   conversations.sector_id — nulo até alguém decidir: o MENU automático de
--                        primeiro contato (lib/setores/menu.ts) ou a equipe.
--   conversation_assignment_events.{from,to}_sector_id + dois motivos novos:
--                        `sector_menu` (o cliente escolheu) e `sector_transfer`
--                        (a equipe moveu). O chip de "quem assumiu" no fio
--                        passa a contar também as transferências de setor.
--   fn_conversation_set_sector — a ÚNICA porta de escrita de `sector_id`, e ela
--                        devolve a conversa à fila: quem era responsável pode
--                        nem ser do setor novo. Grava o evento na mesma transação,
--                        como `fn_conversation_assign` faz para o responsável.
--   fn_can_view_conversation(org, responsável, setor) — a visibilidade ganha o
--                        terceiro eixo. Decisão do dono: quem está em ≥1 setor
--                        (e não é manager+) vê as conversas dos SEUS setores e
--                        as que ainda não têm setor; manager/admin veem tudo;
--                        quem não está em setor nenhum vê tudo, como hoje.
--
-- ## O que NÃO muda
--
-- Rodízio, `visibility_mode`, `fn_conversation_assign`: intocados. O rodízio
-- passa a filtrar por membros do setor no worker (lib/routing/eligibles.ts),
-- mas a função de banco é a mesma. A policy de `messages` herda a de
-- `conversations` por `exists`, então a restrição por setor alcança as
-- mensagens sem uma linha a mais.
--
-- ## A policy nasce `to authenticated`
--
-- `conversations` está na publicação `supabase_realtime`, e a 0209 ensinou o
-- preço de uma policy de SELECT que o `anon` alcança: `apply_rls` a avalia com
-- o papel de cada assinante, a função de RLS levanta para `anon`, e o lote
-- inteiro do WAL morre — para todo mundo. Recriar `conversations_select` sem o
-- `to authenticated` seria reabrir exatamente isso, e a varredura da 0209 no
-- fim do baseline consertaria em quem ATUALIZA, não em quem aplica esta
-- migration pelo CLI. Por isso o `to authenticated` está escrito aqui.

-- ── 1. os setores ──────────────────────────────────────────────────────────
create table if not exists public.sectors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  -- A paleta é a dos marcadores (`CORES_DE_MARCADOR`, lib/schemas/settings.ts):
  -- validada na API, não aqui — uma lista de cores no CHECK acoplaria o banco a
  -- um vocabulário de tela que muda por gosto.
  color           text not null default 'cinza',
  position        integer not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sectors_name_length check (char_length(btrim(name)) between 1 and 60)
);

-- Nome único entre os ATIVOS: arquivar "Financeiro" e criar outro "Financeiro"
-- é legítimo; dois vivos com o mesmo nome no menu do cliente, não.
create unique index if not exists uniq_sectors_org_nome
  on public.sectors (organization_id, lower(btrim(name)))
  where archived_at is null;
create index if not exists idx_sectors_org_position
  on public.sectors (organization_id, position, created_at);

-- ── 2. quem está em qual setor ─────────────────────────────────────────────
create table if not exists public.sector_members (
  sector_id       uuid not null references public.sectors(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Desnormalizado de propósito: é a coluna que a RLS lê em toda linha de
  -- `conversations`, e um JOIN com `sectors` dentro da policy custaria em
  -- toda listagem do inbox.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (sector_id, user_id)
);
create index if not exists idx_sector_members_org_user
  on public.sector_members (organization_id, user_id);

-- ── 3. a conversa aponta para o setor ──────────────────────────────────────
alter table public.conversations
  add column if not exists sector_id uuid references public.sectors(id) on delete set null;
create index if not exists idx_conversations_org_sector
  on public.conversations (organization_id, sector_id)
  where sector_id is not null;

-- ── 4. o evento conta a transferência de setor ─────────────────────────────
alter table public.conversation_assignment_events
  add column if not exists from_sector_id uuid references public.sectors(id) on delete set null;
alter table public.conversation_assignment_events
  add column if not exists to_sector_id uuid references public.sectors(id) on delete set null;

-- A lista INTEIRA, de novo: reconstruir com a lista velha apagaria motivos —
-- é a lição da 0129, vigiada por `migrations-nao-encolhem-vocabulario`.
alter table public.conversation_assignment_events
  drop constraint if exists conversation_assignment_events_reason_check;
alter table public.conversation_assignment_events
  add constraint conversation_assignment_events_reason_check
  check (reason in ('claim','transfer','release','routing','handoff','sector_menu','sector_transfer'));

-- ── 5. RLS dos setores: todo membro lê, manager+ escreve ───────────────────
alter table public.sectors enable row level security;
drop policy if exists sectors_select on public.sectors;
create policy sectors_select on public.sectors
  for select to authenticated using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );
drop policy if exists sectors_write on public.sectors;
create policy sectors_write on public.sectors
  for all to authenticated using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  ) with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );

alter table public.sector_members enable row level security;
drop policy if exists sector_members_select on public.sector_members;
create policy sector_members_select on public.sector_members
  for select to authenticated using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );
drop policy if exists sector_members_write on public.sector_members;
create policy sector_members_write on public.sector_members
  for all to authenticated using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  ) with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );

-- ── 6. a visibilidade ganha o eixo do setor ────────────────────────────────
-- Os setores de quem está logado, nesta organização. SECURITY DEFINER porque é
-- chamada de dentro de policy; `stable` porque a mesma consulta roda uma vez
-- por linha do inbox.
create or replace function public.fn_user_sector_ids(p_org uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select sm.sector_id
    from public.sector_members sm
   where sm.organization_id = p_org
     and sm.user_id = auth.uid();
$$;
revoke all on function public.fn_user_sector_ids(uuid) from public;
revoke execute on function public.fn_user_sector_ids(uuid) from anon;
grant execute on function public.fn_user_sector_ids(uuid) to authenticated, service_role;

-- Corpo da 0035 mais UM ramo, na posição certa: depois de "manager/admin veem
-- tudo" e antes de qualquer regra por responsável. A ordem carrega a decisão —
-- o setor é uma cerca ao redor da fila, e a regra de "minhas / não atribuídas"
-- vale DENTRO da cerca.
create or replace function public.fn_can_view_conversation(
  p_org uuid,
  p_assigned_to_user_id uuid,
  p_sector_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false        -- não é membro
    when public.fn_user_role_in_org(p_org) in ('manager','admin') then true
    -- Em algum setor, e a conversa é de OUTRO: não vê. Conversa sem setor (a
    -- fila antes do menu responder) continua visível — se o menu falhar,
    -- alguém precisa poder assumir.
    when p_sector_id is not null
         and exists (select 1 from public.fn_user_sector_ids(p_org))
         and p_sector_id not in (select public.fn_user_sector_ids(p_org)) then false
    when public.fn_user_role_in_org(p_org) = 'viewer' then true       -- org-wide read
    -- role = 'agent': aplica visibility_mode sobre assigned_to
    when p_assigned_to_user_id = auth.uid() then true                 -- as suas
    else case coalesce(
           (select settings->>'visibility_mode' from public.organizations where id = p_org),
           'own_and_unassigned')                                      -- default G1-06a
         when 'all' then true
         when 'own_and_unassigned' then p_assigned_to_user_id is null -- + fila não-atribuída
         else false                                                   -- 'own': só as suas
       end
  end;
$$;
revoke all on function public.fn_can_view_conversation(uuid, uuid, uuid) from public;
revoke execute on function public.fn_can_view_conversation(uuid, uuid, uuid) from anon;
grant execute on function public.fn_can_view_conversation(uuid, uuid, uuid) to authenticated, service_role;

-- A forma de dois argumentos continua existindo para quem a chama sem saber o
-- setor — e passa a significar "sem cerca de setor", que é o que ela sempre
-- significou.
create or replace function public.fn_can_view_conversation(
  p_org uuid,
  p_assigned_to_user_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fn_can_view_conversation(p_org, p_assigned_to_user_id, null::uuid);
$$;
revoke all on function public.fn_can_view_conversation(uuid, uuid) from public;
revoke execute on function public.fn_can_view_conversation(uuid, uuid) from anon;
grant execute on function public.fn_can_view_conversation(uuid, uuid) to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select to authenticated using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id, sector_id)
  );

-- ── 7. a única porta de escrita de sector_id ───────────────────────────────
-- Devolve a conversa à FILA do setor: quem era o responsável pode nem ser do
-- setor novo, e um responsável que não vê a conversa é uma conversa sem dono
-- que ninguém sabe que está sem dono. O rodízio dentro do setor é assunto do
-- worker, que o chamador acorda emitindo `conversation.routing_requested`.
--
-- O status volta a `open` (a fila), exceto se a conversa estava fechada ou
-- arquivada — transferir uma conversa arquivada não a reabre por acidente.
create or replace function public.fn_conversation_set_sector(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_sector_id uuid,
  p_reason text
) returns setof public.conversations
language plpgsql security definer
set search_path = public
as $$
declare
  v_from_sector uuid;
  v_from_user   uuid;
  v_conv        public.conversations%rowtype;
begin
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_reason not in ('sector_menu', 'sector_transfer') then
    raise exception 'invalid_sector_reason'
      using hint = 'reason must be sector_menu or sector_transfer';
  end if;

  if p_sector_id is not null and not exists (
    select 1 from public.sectors s
     where s.id = p_sector_id
       and s.organization_id = p_organization_id
       and s.archived_at is null
  ) then
    raise exception 'sector_not_found'
      using hint = 'target sector must be an active sector of the organization';
  end if;

  select sector_id, assigned_to_user_id
    into v_from_sector, v_from_user
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
     for update;

  if not found then
    return;
  end if;

  -- Sem mudança, sem evento: transferir para o setor em que já está não é
  -- história para contar no fio.
  if v_from_sector is not distinct from p_sector_id then
    select * into v_conv from public.conversations where id = p_conversation_id;
    return next v_conv;
    return;
  end if;

  update public.conversations
     set sector_id = p_sector_id,
         assigned_to_user_id = null,
         assigned_at = null,
         assignee_kind = null,
         status = case when status in ('closed', 'archived') then status else 'open' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason,
     from_sector_id, to_sector_id)
  values
    (p_organization_id, p_conversation_id, v_from_user, null, auth.uid(), p_reason,
     v_from_sector, p_sector_id);

  return next v_conv;
end;
$$;
revoke all on function public.fn_conversation_set_sector(uuid, uuid, uuid, text) from public;
revoke execute on function public.fn_conversation_set_sector(uuid, uuid, uuid, text) from anon;
grant execute on function public.fn_conversation_set_sector(uuid, uuid, uuid, text)
  to authenticated, service_role;
