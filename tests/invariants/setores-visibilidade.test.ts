import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * SETORES — a visibilidade por setor e a porta de escrita, medidas no banco.
 *
 * Migration 0213. A decisão do dono: quem está em ≥ 1 setor (e não é manager+)
 * vê as conversas dos SEUS setores e as que ainda não têm setor; manager e
 * admin veem tudo; quem não está em setor nenhum vê tudo, como antes.
 *
 * Roda no Postgres efêmero de `scripts/test-db.sh` (baseline aplicado), com o
 * JWT simulado via `set_config('request.jwt.claims', …)` — o mesmo caminho
 * `auth.uid()` que as policies usam em produção. Contagem cross-visibilidade
 * real, não leitura de catálogo: uma policy `... or true` passaria em qualquer
 * checagem de `pg_policy` e devolveria a fila do setor errado.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — run this suite via `pnpm test:db` (scripts/test-db.sh)");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

/** Roda como `authenticated` com o JWT do usuário; devolve a ÚLTIMA linha. */
function comoUsuario(userId: string, consulta: string): string {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${consulta}
  `);
  const linhas = out.split("\n");
  return linhas[linhas.length - 1] ?? "";
}

function contarComo(userId: string, consulta: string): number {
  const ultima = comoUsuario(userId, consulta);
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${ultima}`);
  return Number(ultima);
}

// UUIDs fixos: o seed é idempotente (on conflict do nothing).
const ORG = "5e70c000-0000-4000-8000-000000000001";
const SESS = "5e70c000-2222-4000-8000-000000000001";
const AGENTE_A = "5e70c000-1111-4000-8000-00000000000a"; // no setor A
const AGENTE_LIVRE = "5e70c000-1111-4000-8000-00000000000f"; // em setor nenhum
const MANAGER = "5e70c000-1111-4000-8000-00000000000c";
const SETOR_A = "5e70c000-3333-4000-8000-00000000000a";
const SETOR_B = "5e70c000-3333-4000-8000-00000000000b";
const CONV_A = "5e70c000-4444-4000-8000-00000000000a";
const CONV_B = "5e70c000-4444-4000-8000-00000000000b";
const CONV_SEM = "5e70c000-4444-4000-8000-000000000000";
// Um contato por conversa: `uniq_conversations_1to1_per_contact_session` só
// admite UMA conversa por (org, contato, sessão).
const CONTATO_A = "5e70c000-5555-4000-8000-00000000000a";
const CONTATO_B = "5e70c000-5555-4000-8000-00000000000b";
const CONTATO_SEM = "5e70c000-5555-4000-8000-000000000000";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'setor-a@invariant.test'),
      ('${AGENTE_LIVRE}', 'setor-livre@invariant.test'),
      ('${MANAGER}', 'setor-manager@invariant.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-setores', 'Org Setores', 'Org Setores')
    on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG}', 'agent', now()),
      ('${AGENTE_LIVRE}', '${ORG}', 'agent', now()),
      ('${MANAGER}', '${ORG}', 'manager', now())
    on conflict do nothing;
    -- visibility_mode 'all': isola o eixo do SETOR — sem isto, 'own_and_unassigned'
    -- (o padrão) esconderia a conversa atribuída a outro e o caso mediria a regra errada.
    update public.organizations set settings = coalesce(settings, '{}'::jsonb) || '{"visibility_mode":"all"}'::jsonb
     where id = '${ORG}';
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${SESS}', '${ORG}', 'sess-setores', 'x')
    on conflict (id) do nothing;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO_A}', '${ORG}', 'Cliente da assistência'),
      ('${CONTATO_B}', '${ORG}', 'Cliente do financeiro'),
      ('${CONTATO_SEM}', '${ORG}', 'Cliente sem setor')
    on conflict (id) do nothing;
    insert into public.sectors (id, organization_id, name, position) values
      ('${SETOR_A}', '${ORG}', 'Assistência', 0),
      ('${SETOR_B}', '${ORG}', 'Financeiro', 1)
    on conflict (id) do nothing;
    insert into public.sector_members (sector_id, user_id, organization_id)
      values ('${SETOR_A}', '${AGENTE_A}', '${ORG}')
    on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, sector_id) values
      ('${CONV_A}', '${ORG}', '${CONTATO_A}', '${SESS}', '${SETOR_A}'),
      ('${CONV_B}', '${ORG}', '${CONTATO_B}', '${SESS}', '${SETOR_B}'),
      ('${CONV_SEM}', '${ORG}', '${CONTATO_SEM}', '${SESS}', null)
    on conflict (id) do nothing;
  `);
});

const CONTA = (ids: string[]) =>
  `select count(*) from public.conversations where id in (${ids.map((i) => `'${i}'`).join(",")});`;

describe("quem vê o quê, por setor", () => {
  it("o agent do setor A vê a conversa do setor A e a SEM setor — e NÃO a do setor B", () => {
    expect(contarComo(AGENTE_A, CONTA([CONV_A]))).toBe(1);
    expect(contarComo(AGENTE_A, CONTA([CONV_SEM]))).toBe(1);
    expect(contarComo(AGENTE_A, CONTA([CONV_B]))).toBe(0);
  });

  it("o agent em setor NENHUM vê tudo — como sempre viu", () => {
    expect(contarComo(AGENTE_LIVRE, CONTA([CONV_A, CONV_B, CONV_SEM]))).toBe(3);
  });

  it("o manager vê tudo, esteja ou não em algum setor", () => {
    expect(contarComo(MANAGER, CONTA([CONV_A, CONV_B, CONV_SEM]))).toBe(3);
    sql(`insert into public.sector_members (sector_id, user_id, organization_id)
           values ('${SETOR_A}', '${MANAGER}', '${ORG}') on conflict do nothing;`);
    expect(contarComo(MANAGER, CONTA([CONV_A, CONV_B, CONV_SEM]))).toBe(3);
  });

  it("as MENSAGENS herdam a cerca: mensagem da conversa do setor B some para o agent do A", () => {
    sql(`
      insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
        select '${ORG}', '${CONV_B}', '${SESS}', '${CONTATO_B}', 'text', 'inbound', 'oi financeiro'
        where not exists (select 1 from public.messages where conversation_id = '${CONV_B}');
    `);
    expect(contarComo(AGENTE_A, `select count(*) from public.messages where conversation_id = '${CONV_B}';`)).toBe(0);
    expect(contarComo(MANAGER, `select count(*) from public.messages where conversation_id = '${CONV_B}';`)).toBe(1);
  });

  it("CONTROLE: com a cerca sabotada (membro do setor B também), a conversa do B aparece", () => {
    // Prova que o zero de cima vem da regra, e não de a conversa não existir.
    sql(`insert into public.sector_members (sector_id, user_id, organization_id)
           values ('${SETOR_B}', '${AGENTE_A}', '${ORG}') on conflict do nothing;`);
    expect(contarComo(AGENTE_A, CONTA([CONV_B]))).toBe(1);
    sql(`delete from public.sector_members where sector_id = '${SETOR_B}' and user_id = '${AGENTE_A}';`);
    expect(contarComo(AGENTE_A, CONTA([CONV_B]))).toBe(0);
  });
});

describe("fn_conversation_set_sector — a única porta de escrita", () => {
  it("põe no setor, DEVOLVE à fila e grava o evento com os dois setores", () => {
    sql(`
      update public.conversations
         set assigned_to_user_id = '${AGENTE_LIVRE}', assignee_kind = 'user', assigned_at = now(), status = 'claimed'
       where id = '${CONV_SEM}';
    `);
    const linhas = comoUsuario(
      MANAGER,
      `select count(*) from public.fn_conversation_set_sector('${ORG}', '${CONV_SEM}', '${SETOR_B}', 'sector_transfer');`,
    );
    expect(linhas).toBe("1");
    const estado = sql(
      `select coalesce(sector_id::text,'-') || '|' || coalesce(assigned_to_user_id::text,'-') || '|' || status
         from public.conversations where id = '${CONV_SEM}';`,
    );
    expect(estado).toBe(`${SETOR_B}|-|open`);
    const evento = sql(
      `select reason || '|' || coalesce(from_user_id::text,'-') || '|' || coalesce(from_sector_id::text,'-') || '|' || coalesce(to_sector_id::text,'-')
         from public.conversation_assignment_events
        where conversation_id = '${CONV_SEM}' order by created_at desc limit 1;`,
    );
    expect(evento).toBe(`sector_transfer|${AGENTE_LIVRE}|-|${SETOR_B}`);
  });

  it("recusa motivo que não é de setor e setor de outra organização", () => {
    expect(() =>
      sql(`select public.fn_conversation_set_sector('${ORG}', '${CONV_SEM}', '${SETOR_A}', 'transfer');`),
    ).toThrow(/invalid_sector_reason/);
    expect(() =>
      sql(`select public.fn_conversation_set_sector('${ORG}', '${CONV_SEM}', '00000000-0000-4000-8000-0000000000ff', 'sector_menu');`),
    ).toThrow(/sector_not_found/);
  });

  it("um viewer não escreve setor: a função exige agent+", () => {
    sql(`
      insert into auth.users (id, email) values ('5e70c000-1111-4000-8000-00000000000e', 'setor-viewer@invariant.test') on conflict (id) do nothing;
      insert into public.user_organizations (user_id, organization_id, role, accepted_at)
        values ('5e70c000-1111-4000-8000-00000000000e', '${ORG}', 'viewer', now()) on conflict do nothing;
    `);
    expect(() =>
      comoUsuario(
        "5e70c000-1111-4000-8000-00000000000e",
        `select public.fn_conversation_set_sector('${ORG}', '${CONV_SEM}', '${SETOR_A}', 'sector_transfer');`,
      ),
    ).toThrow(/caller_not_authorized_for_org/);
  });

  it("a escrita nas tabelas de setor é manager+: o agent não cria setor", () => {
    expect(() =>
      comoUsuario(AGENTE_A, `insert into public.sectors (organization_id, name) values ('${ORG}', 'Setor do agent');`),
    ).toThrow(/row-level security/);
    const antes = Number(sql(`select count(*) from public.sectors where organization_id = '${ORG}';`));
    comoUsuario(MANAGER, `insert into public.sectors (organization_id, name) values ('${ORG}', 'Setor do manager');`);
    const depois = Number(sql(`select count(*) from public.sectors where organization_id = '${ORG}';`));
    expect(depois).toBe(antes + 1);
  });

  it("o nome é único entre os ATIVOS, e arquivar libera o nome", () => {
    expect(() =>
      sql(`insert into public.sectors (organization_id, name) values ('${ORG}', '  financeiro ');`),
    ).toThrow(/uniq_sectors_org_nome/);
    sql(`update public.sectors set archived_at = now() where id = '${SETOR_B}';`);
    sql(`insert into public.sectors (organization_id, name) values ('${ORG}', 'Financeiro');`);
    // Desfaz na ordem que o índice aceita: some o novo, DEPOIS o antigo volta.
    sql(`delete from public.sectors where organization_id = '${ORG}' and name = 'Financeiro' and id <> '${SETOR_B}';
         update public.sectors set archived_at = null where id = '${SETOR_B}';`);
  });
});
