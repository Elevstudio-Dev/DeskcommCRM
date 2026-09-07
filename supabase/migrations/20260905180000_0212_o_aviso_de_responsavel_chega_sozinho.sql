-- 0212 — o aviso de "quem assumiu" chega SOZINHO, sem recarregar a página.
--
-- ## O defeito, relatado pelo dono
--
-- "essa mensagem só aparece quando eu atualizo a página".
--
-- `useConversationAssignmentEvents` assina `postgres_changes` na tabela
-- `conversation_assignment_events` — e a tabela nunca esteve na publicação
-- `supabase_realtime`. Assinar uma tabela não publicada NÃO dá erro: o canal
-- responde SUBSCRIBED e simplesmente nunca entrega nada. É a mesma família de
-- silêncio que a 0209 tratou, por outra causa.
--
-- O caso que o recurso existe para resolver é justamente o que mais sofria:
-- duas pessoas com a mesma conversa aberta. Quem já estava com a tela aberta
-- continuava vendo a conversa como livre depois de o colega assumir — que é
-- exatamente a colisão que o aviso deveria evitar.
--
-- ## A ORDEM DOS DOIS PASSOS É A PARTE PERIGOSA
--
-- Publicar antes de restringir a policy reintroduziria o defeito da 0209, e não
-- só nesta tabela: `realtime.apply_rls` avalia a policy de SELECT com o papel de
-- CADA assinante, inclusive `anon` (todo navegador assina antes de o token
-- chegar ao socket — 3 assinaturas `anon` por carregamento, medidas). As funções
-- de RLS têm `revoke execute ... from anon` por convenção desta base, então para
-- o assinante `anon` a função não devolve `false`: LEVANTA. E `apply_rls`
-- levantando derruba o LOTE INTEIRO do WAL — inclusive para o assinante
-- autenticado, inclusive as MENSAGENS.
--
-- Ou seja: publicar esta tabela com a policy como está mataria o tempo real do
-- inbox inteiro para consertar um aviso. Por isso a policy é restringida
-- PRIMEIRO, e a publicação vem depois. Entre um passo e outro nunca existe uma
-- tabela publicada com policy de SELECT alcançável pelo `anon`.
--
-- ## Por que `authenticated` não é afrouxamento
--
-- O `anon` nunca teve o que ler aqui: a policy exige que a conversa exista e
-- pertença a uma organização do usuário, e `anon` não tem organização nenhuma.
-- Restringir não tira acesso de ninguém — só deixa de pedir ao `anon` que avalie
-- uma expressão que ele não pode avaliar.

-- ── 1. a policy PRIMEIRO ───────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'conversation_assignment_events'
       and cmd = 'SELECT'
       and 'public' = any (roles)
  ) then
    alter policy cae_select on public.conversation_assignment_events to authenticated;
    raise notice '0212: cae_select agora vale só para authenticated';
  end if;
end
$$;

-- ── 2. a publicação DEPOIS ─────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_assignment_events'
  ) then
    alter publication supabase_realtime add table public.conversation_assignment_events;
    raise notice '0212: conversation_assignment_events entrou no supabase_realtime';
  end if;
end
$$;

-- ── 3. o corpo da linha precisa chegar inteiro ─────────────────────────────
-- Sem `replica identity full`, um UPDATE/DELETE entrega só a chave primária, e
-- o assinante recebe um evento sem saber DE QUE conversa ele é — o filtro
-- `conversation_id=eq.…` do cliente não casa e o evento é descartado em
-- silêncio. A tabela é append-only na prática, mas depender disso seria
-- depender de um costume: um DELETE por cascata (a conversa apagada) já é
-- suficiente para o caso aparecer.
alter table public.conversation_assignment_events replica identity full;
