import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * NENHUMA TABELA PUBLICADA PODE TER POLICY DE SELECT QUE ALCANCE O `anon`.
 *
 * ─── O defeito, medido ─────────────────────────────────────────────────────
 *
 * O walrus decide quem recebe cada mudança avaliando a policy de SELECT da
 * tabela COM O PAPEL DE CADA ASSINANTE. Se a policy vale para `public`, ela é
 * avaliada também para o assinante `anon` — e as funções de RLS desta base têm
 * `revoke execute ... from anon`. Para o `anon` a função não devolve `false`:
 * ela LEVANTA.
 *
 *   realtime.apply_rls linha 219, "execute walrus_rls_stmt"
 *   ERROR 42501 — permission denied for function fn_can_view_conversation
 *
 * E `apply_rls` levantando derruba o LOTE INTEIRO: o assinante autenticado, que
 * tinha todo o direito de receber, não recebe nada. Medido em 2026-09-04: 75
 * ocorrências no log do realtime, e `tests/e2e/inbox-tempo-real.spec.ts`
 * falhando 5 de 6 rodadas. O atendente com o Inbox aberto não via a mensagem do
 * cliente chegar — sem erro na tela, com o canal dizendo `subscribed`.
 *
 * ─── Por que um teste de banco, e não só o E2E ─────────────────────────────
 *
 * O E2E pega o sintoma numa tabela (`messages`) e leva 12s no caminho feliz e
 * 30s no ruim. Este pega a CLASSE em milissegundos: tabela nova entrando na
 * publicação com policy `public` é o mesmo defeito outra vez, e o E2E dela pode
 * nem existir. O sintoma também é péssimo para diagnosticar — canal
 * `subscribed`, zero perdas contadas, nada no console do navegador. Custou
 * quatro hipóteses erradas para chegar ao log do contêiner do realtime.
 *
 * ─── O que este teste NÃO afirma ───────────────────────────────────────────
 *
 * Que restringir a policy é a única correção possível. Conceder `execute` ao
 * `anon` nas funções de RLS conserta igual — as duas foram medidas, 3/3 verdes
 * cada. O repositório escolheu a primeira porque a segunda desfaria a convenção
 * de endurecimento aplicada em dezenas de migrations. Quem trocar de estratégia
 * um dia troca este arquivo junto, e deliberadamente.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function psql(sql: string): string[] {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PUBLICADAS = `
  select t.tablename
    from pg_publication_tables t
   where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
   order by 1`;

/** Policies de SELECT de tabela publicada que ainda alcançam `public`/`anon`. */
const ALCANCAM_O_ANON = `
  select p.tablename || '.' || p.policyname || ' -> ' || p.roles::text
    from pg_policies p
   where p.schemaname = 'public'
     and p.cmd = 'SELECT'
     and p.tablename in (${PUBLICADAS})
     and ('public' = any (p.roles) or 'anon' = any (p.roles))
   order by 1`;

describe("o realtime nunca avalia uma policy com um papel que não pode avaliá-la", () => {
  it("a sonda enxerga a publicação (guarda de vacuidade)", () => {
    // Publicação vazia faria a asserção seguinte passar medindo o vácuo — que é
    // o modo de falha desta classe de teste.
    expect(psql(PUBLICADAS).length).toBeGreaterThan(5);
  });

  it("as tabelas publicadas têm policy de SELECT (segunda guarda de vacuidade)", () => {
    // Sem nenhuma policy de SELECT, "nenhuma alcança o anon" também seria
    // verdade por vácuo — e significaria RLS desligada, que é pior.
    const comPolicy = psql(`
      select distinct p.tablename
        from pg_policies p
       where p.schemaname='public' and p.cmd='SELECT'
         and p.tablename in (${PUBLICADAS})`);
    expect(comPolicy.length).toBeGreaterThan(5);
  });

  it("nenhuma policy de SELECT de tabela publicada alcança o anon", () => {
    const infratoras = psql(ALCANCAM_O_ANON);
    expect(
      infratoras,
      "Estas policies serão avaliadas para assinantes `anon`, que não podem executar as " +
        "funções de RLS. O walrus levanta e o LOTE INTEIRO morre — inclusive para quem " +
        "está autenticado. Corrija com `alter policy <nome> on public.<tabela> to " +
        "authenticated` e leve a mudança para supabase/baseline.sql (o kit self-host " +
        "aplica SÓ o baseline):\n  " + infratoras.join("\n  "),
    ).toEqual([]);
  });
});
