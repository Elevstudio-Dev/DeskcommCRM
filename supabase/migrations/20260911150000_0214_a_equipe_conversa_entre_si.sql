-- 0214 — a equipe conversa entre si: o CHAT INTERNO.
--
-- ## O pedido
--
-- "Ter a opção de chat interno, pra falar com a equipe que está ali." Decisão
-- do dono: canais por SETOR, um canal GERAL, e conversa DIRETA 1:1 — o
-- WhatsApp da equipe, dentro do CRM, com histórico guardado.
--
-- ## O que entra
--
--   team_channels         — o canal: `geral` (um por organização), `setor` (um
--                           por setor, nasce com ele), `direto` (um por par de
--                           pessoas; `direct_key` é o par ordenado, para o
--                           mesmo par nunca virar dois canais).
--   team_channel_members  — quem está no canal, e até onde leu
--                           (`last_read_at`, o contador de não lidas). Em
--                           `geral` e `setor` a linha nasce na primeira leitura;
--                           em `direto` nasce com o canal, para os dois.
--   team_messages         — a mensagem. `sender_name` DESNORMALIZADO na linha,
--                           como `conversation_notes.created_by_name`: resolver
--                           nome por id custa uma chamada HTTP ao GoTrue por
--                           pessoa (`lib/users/nome-do-atendente.ts`), e um
--                           fio de chat é justamente a tela com mais remetentes
--                           distintos.
--
-- ## Quem lê o quê (RLS)
--
--   geral   — todo membro da organização.
--   setor   — quem está no setor (`sector_members`) e manager+.
--   direto  — os dois da conversa (`team_channel_members`).
--   mensagem — herda o canal por `exists`, como `messages` herda `conversations`.
--   escrever — só quem lê o canal, e só como si mesmo (`sender_user_id = auth.uid()`).
--
-- ## A publicação, na ORDEM certa
--
-- `team_messages` entra no `supabase_realtime` — é o que faz a mensagem do
-- colega aparecer sem F5. A policy de SELECT nasce `to authenticated` ANTES
-- de a tabela ser publicada: a lição da 0209/0212 — `apply_rls` avalia a
-- policy com o papel de cada assinante, o `anon` não pode executar as funções
-- de RLS, e uma policy que levanta para o `anon` derruba o lote inteiro do WAL
-- para todo mundo. Entre um passo e outro nunca existe tabela publicada com
-- policy alcançável pelo `anon`.

-- ── 1. os canais ───────────────────────────────────────────────────────────
create table if not exists public.team_channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null,
  sector_id       uuid references public.sectors(id) on delete cascade,
  -- O par ordenado `menor_uuid:maior_uuid` de um canal direto. Nulo nos outros.
  direct_key      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint team_channels_kind_check check (kind in ('geral', 'setor', 'direto')),
  -- Cada tipo tem exatamente o que precisa, e nada mais.
  constraint team_channels_kind_shape_check check (
    (kind = 'geral'  and sector_id is null     and direct_key is null) or
    (kind = 'setor'  and sector_id is not null and direct_key is null) or
    (kind = 'direto' and sector_id is null     and direct_key is not null)
  )
);
create unique index if not exists uniq_team_channels_geral
  on public.team_channels (organization_id) where kind = 'geral';
create unique index if not exists uniq_team_channels_setor
  on public.team_channels (sector_id) where kind = 'setor';
create unique index if not exists uniq_team_channels_direto
  on public.team_channels (organization_id, direct_key) where kind = 'direto';

-- ── 2. quem está no canal, e até onde leu ──────────────────────────────────
create table if not exists public.team_channel_members (
  channel_id      uuid not null references public.team_channels(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_read_at    timestamptz,
  created_at      timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists idx_team_channel_members_org_user
  on public.team_channel_members (organization_id, user_id);

-- ── 3. as mensagens ────────────────────────────────────────────────────────
create table if not exists public.team_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id      uuid not null references public.team_channels(id) on delete cascade,
  sender_user_id  uuid references auth.users(id) on delete set null,
  sender_name     text,
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint team_messages_body_length check (char_length(body) between 1 and 4000)
);
create index if not exists idx_team_messages_channel_created
  on public.team_messages (channel_id, created_at desc);
create index if not exists idx_team_messages_org_created
  on public.team_messages (organization_id, created_at desc);

-- ── 4. quem vê o canal ─────────────────────────────────────────────────────
-- SECURITY DEFINER e `stable`: chamada de dentro de policy, uma vez por linha.
-- `revoke ... from anon`, como toda função de RLS desta base — e é por isso
-- que as policies abaixo nascem `to authenticated`.
create or replace function public.fn_can_view_team_channel(
  p_org uuid,
  p_channel_id uuid,
  p_kind text,
  p_sector_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when p_kind = 'geral' then true
    when p_kind = 'setor' then
      public.fn_user_role_in_org(p_org) in ('manager', 'admin')
      or exists (
        select 1 from public.sector_members sm
         where sm.organization_id = p_org
           and sm.sector_id = p_sector_id
           and sm.user_id = auth.uid()
      )
    when p_kind = 'direto' then exists (
      select 1 from public.team_channel_members m
       where m.channel_id = p_channel_id
         and m.user_id = auth.uid()
    )
    else false
  end;
$$;
revoke all on function public.fn_can_view_team_channel(uuid, uuid, text, uuid) from public;
revoke execute on function public.fn_can_view_team_channel(uuid, uuid, text, uuid) from anon;
grant execute on function public.fn_can_view_team_channel(uuid, uuid, text, uuid) to authenticated, service_role;

alter table public.team_channels enable row level security;
drop policy if exists team_channels_select on public.team_channels;
create policy team_channels_select on public.team_channels
  for select to authenticated using (
    public.fn_can_view_team_channel(organization_id, id, kind, sector_id)
  );
-- Canal se cria pela API com service role (o par de um direto, o geral, o de
-- cada setor). Pelo cliente de sessão, ninguém cria nem apaga canal.

alter table public.team_channel_members enable row level security;
drop policy if exists team_channel_members_select on public.team_channel_members;
create policy team_channel_members_select on public.team_channel_members
  for select to authenticated using (
    public.fn_is_platform_admin()
    or exists (select 1 from public.team_channels c where c.id = team_channel_members.channel_id)
  );
-- A PRÓPRIA linha de leitura: é o "até onde eu li". Inserir a própria (geral e
-- setor nascem na primeira leitura) e atualizar a própria.
drop policy if exists team_channel_members_insert_self on public.team_channel_members;
create policy team_channel_members_insert_self on public.team_channel_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.team_channels c where c.id = team_channel_members.channel_id)
  );
drop policy if exists team_channel_members_update_self on public.team_channel_members;
create policy team_channel_members_update_self on public.team_channel_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.team_messages enable row level security;
drop policy if exists team_messages_select on public.team_messages;
create policy team_messages_select on public.team_messages
  for select to authenticated using (
    public.fn_is_platform_admin()
    or exists (select 1 from public.team_channels c where c.id = team_messages.channel_id)
  );
drop policy if exists team_messages_insert on public.team_messages;
create policy team_messages_insert on public.team_messages
  for insert to authenticated with check (
    sender_user_id = auth.uid()
    and organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.team_channels c where c.id = team_messages.channel_id)
  );

-- ── 5. a publicação, DEPOIS da policy ──────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'team_messages'
  ) then
    alter publication supabase_realtime add table public.team_messages;
    raise notice '0214: team_messages entrou no supabase_realtime';
  end if;
end
$$;
alter table public.team_messages replica identity full;
