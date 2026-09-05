-- 0211 — o Instagram entra como CANAL, e não como remendo no WhatsApp.
--
-- ## O que esta migration faz, e o que ela deliberadamente NÃO faz
--
-- Ela abre o vocabulário de `channel_sessions` para um quarto provider. Não
-- conecta conta nenhuma: a conexão depende de um app aprovado pela Meta (App
-- Review de `instagram_manage_messages`, Business Verification), o que não
-- depende deste repositório e tem prazo próprio. A tela de conexão sai marcada
-- como "em breve", por decisão do dono.
--
-- O trabalho é este porque `lib/channels/` já tem o encaixe pronto: um
-- `ChannelAdapter` que só traduz formato, um descritor de capabilities que diz
-- o que o canal permite, e um registro que FALHA FECHADO em provider
-- desconhecido. O que faltava era o banco aceitar o nome.
--
-- ## Por que uma coluna nova, e não reusar `meta_phone_number_id`
--
-- O Direct do Instagram é servido pela mesma Graph API da Cloud API do
-- WhatsApp, e a tentação de reusar a coluna é grande. Mas o identificador é
-- OUTRO: lá é um `phone_number_id`, aqui é o id da conta profissional do
-- Instagram (IGSID da página vinculada). Guardar dois significados na mesma
-- coluna quebraria a `channel_sessions_provider_ref_check`, que existe
-- exatamente para garantir que a coluna do provider da vez é NOT NULL — e
-- transformaria `resolveSessionRef` num `if` sobre o provider dentro da própria
-- função que existe para não ter um.
--
-- ## Os dois CHECK, e por que os dois
--
-- `provider_check` é o vocabulário: sem ele, `provider='instagram'` é recusado
-- e nada mais importa. `provider_ref_check` é a amarração: sem ele, uma linha
-- de Instagram poderia nascer sem id nenhum, e `resolveSessionRef` devolveria
-- `undefined` — que o TypeScript declara como `string`. O tipo mentiria, e a
-- mentira só apareceria no primeiro envio.
--
-- Ordem importa: a coluna PRIMEIRO, senão o CHECK referencia coluna que não
-- existe e a migration morre no meio, deixando o vocabulário aberto e a
-- amarração velha — o pior dos dois mundos.

-- ── 1. o identificador da conta ────────────────────────────────────────────
alter table public.channel_sessions
  add column if not exists instagram_account_id text;

comment on column public.channel_sessions.instagram_account_id is
  'Id da conta profissional do Instagram (IGSID). NÃO é o meta_phone_number_id: a Graph API é a mesma, o identificador não.';

-- ── 2. o vocabulário aceita o quarto nome ──────────────────────────────────
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'instagram'::text]));

-- ── 3. a amarração provider ↔ coluna ──────────────────────────────────────
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check
  check (
    (provider = 'waha' and waha_session_name is not null)
    or (provider = 'meta_cloud' and meta_phone_number_id is not null)
    or (provider = 'zernio' and zernio_account_id is not null)
    or (provider = 'instagram' and instagram_account_id is not null)
  );

-- ── 4. um número/conta por organização, como nos outros ───────────────────
-- Espelha a trava que a 0106 criou para o par (org, número): duas sessões para
-- a MESMA conta na mesma organização produziriam entrega dupla e um "quem é o
-- canal desta conversa?" sem resposta. Parcial porque a esmagadora maioria das
-- linhas não é Instagram.
create unique index if not exists uniq_channel_sessions_org_instagram
  on public.channel_sessions (organization_id, instagram_account_id)
  where instagram_account_id is not null;
