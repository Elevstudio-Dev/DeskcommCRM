-- 0207 — o canal responde SUBSCRIBED e o quadro morre calado no walrus.
--
-- MEDIDO, não deduzido (2026-09-04, Supabase local pg17):
--
--   realtime.apply_rls linha 219, "execute walrus_rls_stmt"
--   ERROR 42501 insufficient_privilege
--   "permission denied for function fn_can_view_conversation"
--
--   75 ocorrências desde 2026-09-03 14:43. `tests/e2e/inbox-tempo-real.spec.ts`
--   falhou 5 de 6 rodadas; com o conserto, 3 de 3 verdes em ~12s e ZERO erros
--   novos no log do realtime.
--
-- A CADEIA. O walrus decide quem recebe cada mudança avaliando a policy de
-- SELECT da tabela COM O PAPEL DE CADA ASSINANTE. As policies das tabelas
-- publicadas valiam para `public`, ou seja, também para `anon` — e as funções
-- de RLS têm `revoke execute ... from anon`, convenção desta base aplicada em
-- dezenas de migrations. Para o assinante `anon` a função não devolve `false`:
-- ela LEVANTA. E `apply_rls` levantando derruba o LOTE INTEIRO — o assinante
-- autenticado, que tinha todo o direito de receber, não recebe nada.
--
-- Um socket `anon` existe em toda instalação: o cliente do navegador assina
-- antes de o token chegar ao socket. Medido: 3 assinaturas `anon` durante o
-- carregamento, virando `authenticated` depois. Uma delas basta para calar a
-- entrega de todo mundo.
--
-- O QUE ISSO CUSTAVA AO PRODUTO: o atendente com o Inbox aberto não via a
-- mensagem do cliente chegar. Sem erro na tela, com o canal dizendo
-- `subscribed`. É o sintoma que `hooks/inbox/useMessagesRealtime.ts:52` já
-- registrava — "às vezes preciso atualizar para a mensagem aparecer" — e o
-- defeito que `tests/e2e/degradacao-silenciosa.spec.ts` descreve como classe.
--
-- POR QUE RESTRINGIR A POLICY E NÃO CONCEDER A FUNÇÃO AO ANON. As duas
-- consertam, e medi as duas (3/3 verdes cada). Conceder `execute` ao `anon`
-- desfaria a convenção de endurecimento desta base, que revoga `anon` de tudo.
-- Restringir a policy a `authenticated` chega ao mesmo lugar pelo lado certo:
-- o `anon` não passa a poder MENOS por acidente — ele nunca teve o que ler
-- nessas tabelas (medido: 0 conversas, 0 mensagens, 0 leads) —, apenas deixa
-- de ser avaliado por uma expressão que ele não tem permissão de avaliar.
--
-- DINÂMICO DE PROPÓSITO, e não uma lista de sete nomes: o invariante é "nenhuma
-- tabela publicada pode ter policy de SELECT que alcance o anon". Tabela nova
-- entrando na publicação com policy `public` seria o mesmo defeito outra vez, e
-- o kit reaplica este arquivo a cada `update.sh` — então ele se cura sozinho.
-- Quem cobra o invariante no CI é
-- `tests/invariants/realtime-nao-avalia-policy-como-anon.test.ts`.
do $$
declare
  r record;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname
      from pg_policies p
     where p.schemaname = 'public'
       and p.cmd = 'SELECT'
       and p.tablename in (
             select t.tablename
               from pg_publication_tables t
              where t.pubname = 'supabase_realtime'
                and t.schemaname = 'public')
       and 'public' = any (p.roles)
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      r.policyname, r.schemaname, r.tablename);
    raise notice '0207: policy % em %.% agora vale só para authenticated',
      r.policyname, r.schemaname, r.tablename;
  end loop;
end
$$;
