import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * CHAT INTERNO — quem lê e quem escreve em cada canal, medido no banco.
 *
 * Migration 0214. Canal `geral`: todo membro da organização. Canal `setor`:
 * quem está no setor e manager+. Canal `direto`: os dois do par. A mensagem
 * herda o canal; escrever é só como si mesmo, e só em canal que se lê.
 *
 * Roda no Postgres efêmero de `scripts/test-db.sh`, com JWT simulado — a mesma
 * trilha `auth.uid()` das policies em produção. Contagem real, não catálogo.
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

const ORG = "c4a7c000-0000-4000-8000-000000000001";
const ORG_OUTRA = "c4a7c000-0000-4000-8000-000000000002";
const ANA = "c4a7c000-1111-4000-8000-00000000000a"; // agent, setor Financeiro
const BIA = "c4a7c000-1111-4000-8000-00000000000b"; // agent, setor nenhum
const CAIO = "c4a7c000-1111-4000-8000-00000000000c"; // manager
const DEBORA = "c4a7c000-1111-4000-8000-00000000000d"; // agent da OUTRA org
const SETOR_FIN = "c4a7c000-3333-4000-8000-00000000000f";
const GERAL = "c4a7c000-5555-4000-8000-000000000001";
const CANAL_FIN = "c4a7c000-5555-4000-8000-00000000000f";
const DIRETO_AB = "c4a7c000-5555-4000-8000-0000000000ab";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ANA}', 'chat-ana@invariant.test'), ('${BIA}', 'chat-bia@invariant.test'),
      ('${CAIO}', 'chat-caio@invariant.test'), ('${DEBORA}', 'chat-debora@invariant.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'org-chat', 'Org Chat', 'Org Chat'),
      ('${ORG_OUTRA}', 'org-chat-outra', 'Outra', 'Outra')
    on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ANA}', '${ORG}', 'agent', now()), ('${BIA}', '${ORG}', 'agent', now()),
      ('${CAIO}', '${ORG}', 'manager', now()), ('${DEBORA}', '${ORG_OUTRA}', 'agent', now())
    on conflict do nothing;
    insert into public.sectors (id, organization_id, name) values ('${SETOR_FIN}', '${ORG}', 'Financeiro')
    on conflict (id) do nothing;
    insert into public.sector_members (sector_id, user_id, organization_id) values ('${SETOR_FIN}', '${ANA}', '${ORG}')
    on conflict do nothing;
    insert into public.team_channels (id, organization_id, kind, sector_id, direct_key) values
      ('${GERAL}', '${ORG}', 'geral', null, null),
      ('${CANAL_FIN}', '${ORG}', 'setor', '${SETOR_FIN}', null),
      ('${DIRETO_AB}', '${ORG}', 'direto', null, '${ANA}:${BIA}')
    on conflict (id) do nothing;
    insert into public.team_channel_members (channel_id, user_id, organization_id) values
      ('${DIRETO_AB}', '${ANA}', '${ORG}'), ('${DIRETO_AB}', '${BIA}', '${ORG}')
    on conflict do nothing;
    insert into public.team_messages (organization_id, channel_id, sender_user_id, sender_name, body)
      select '${ORG}', '${CANAL_FIN}', '${ANA}', 'Ana', 'o boleto caiu?'
      where not exists (select 1 from public.team_messages where channel_id = '${CANAL_FIN}');
    insert into public.team_messages (organization_id, channel_id, sender_user_id, sender_name, body)
      select '${ORG}', '${DIRETO_AB}', '${BIA}', 'Bia', 'só entre nós'
      where not exists (select 1 from public.team_messages where channel_id = '${DIRETO_AB}');
  `);
});

const CANAL = (id: string) => `select count(*) from public.team_channels where id = '${id}';`;
const MSGS = (canal: string) => `select count(*) from public.team_messages where channel_id = '${canal}';`;

describe("quem vê qual canal", () => {
  it("Geral: todo membro da organização; ninguém de fora", () => {
    expect(contarComo(ANA, CANAL(GERAL))).toBe(1);
    expect(contarComo(BIA, CANAL(GERAL))).toBe(1);
    expect(contarComo(CAIO, CANAL(GERAL))).toBe(1);
    expect(contarComo(DEBORA, CANAL(GERAL))).toBe(0);
  });

  it("Setor: quem está no setor e o manager — não quem está fora dele", () => {
    expect(contarComo(ANA, CANAL(CANAL_FIN))).toBe(1);
    expect(contarComo(CAIO, CANAL(CANAL_FIN))).toBe(1);
    expect(contarComo(BIA, CANAL(CANAL_FIN))).toBe(0);
    expect(contarComo(BIA, MSGS(CANAL_FIN))).toBe(0);
    expect(contarComo(ANA, MSGS(CANAL_FIN))).toBe(1);
  });

  it("Direto: só os dois — nem o manager lê a conversa alheia", () => {
    expect(contarComo(ANA, CANAL(DIRETO_AB))).toBe(1);
    expect(contarComo(BIA, MSGS(DIRETO_AB))).toBe(1);
    expect(contarComo(CAIO, CANAL(DIRETO_AB))).toBe(0);
    expect(contarComo(CAIO, MSGS(DIRETO_AB))).toBe(0);
  });

  it("CONTROLE: pôr a Bia no setor faz o canal do setor aparecer para ela", () => {
    sql(`insert into public.sector_members (sector_id, user_id, organization_id) values ('${SETOR_FIN}', '${BIA}', '${ORG}') on conflict do nothing;`);
    expect(contarComo(BIA, CANAL(CANAL_FIN))).toBe(1);
    sql(`delete from public.sector_members where sector_id = '${SETOR_FIN}' and user_id = '${BIA}';`);
    expect(contarComo(BIA, CANAL(CANAL_FIN))).toBe(0);
  });
});

describe("quem escreve", () => {
  it("escreve quem lê o canal, e só como si mesmo", () => {
    comoUsuario(ANA, `insert into public.team_messages (organization_id, channel_id, sender_user_id, sender_name, body)
      values ('${ORG}', '${CANAL_FIN}', '${ANA}', 'Ana', 'caiu sim');`);
    expect(Number(sql(MSGS(CANAL_FIN)))).toBe(2);

    // Como OUTRA pessoa: recusado.
    expect(() =>
      comoUsuario(ANA, `insert into public.team_messages (organization_id, channel_id, sender_user_id, sender_name, body)
        values ('${ORG}', '${CANAL_FIN}', '${BIA}', 'Bia', 'em nome dela');`),
    ).toThrow(/row-level security/);
    // Em canal que não lê: recusado.
    expect(() =>
      comoUsuario(BIA, `insert into public.team_messages (organization_id, channel_id, sender_user_id, sender_name, body)
        values ('${ORG}', '${CANAL_FIN}', '${BIA}', 'Bia', 'invasão');`),
    ).toThrow(/row-level security/);
  });

  it("ninguém cria canal pelo cliente de sessão — isso é da API, com service role", () => {
    expect(() =>
      comoUsuario(CAIO, `insert into public.team_channels (organization_id, kind) values ('${ORG}', 'geral');`),
    ).toThrow(/row-level security|permission denied/);
  });

  it("a própria linha de leitura: cria e avança a sua, não a do outro", () => {
    comoUsuario(ANA, `insert into public.team_channel_members (channel_id, user_id, organization_id, last_read_at)
      values ('${GERAL}', '${ANA}', '${ORG}', now()) on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;`);
    expect(Number(sql(`select count(*) from public.team_channel_members where channel_id = '${GERAL}' and user_id = '${ANA}';`))).toBe(1);
    expect(() =>
      comoUsuario(ANA, `insert into public.team_channel_members (channel_id, user_id, organization_id) values ('${GERAL}', '${BIA}', '${ORG}');`),
    ).toThrow(/row-level security/);
  });
});

describe("o banco impede o que a API não deveria nem tentar", () => {
  it("um par só vira UM canal direto", () => {
    expect(() =>
      sql(`insert into public.team_channels (organization_id, kind, direct_key) values ('${ORG}', 'direto', '${ANA}:${BIA}');`),
    ).toThrow(/uniq_team_channels_direto/);
  });

  it("um Geral por organização; um canal por setor", () => {
    expect(() => sql(`insert into public.team_channels (organization_id, kind) values ('${ORG}', 'geral');`)).toThrow(/uniq_team_channels_geral/);
    expect(() =>
      sql(`insert into public.team_channels (organization_id, kind, sector_id) values ('${ORG}', 'setor', '${SETOR_FIN}');`),
    ).toThrow(/uniq_team_channels_setor/);
  });

  it("a forma de cada tipo é fixa: setor sem sector_id não existe", () => {
    expect(() => sql(`insert into public.team_channels (organization_id, kind) values ('${ORG}', 'setor');`)).toThrow(
      /team_channels_kind_shape_check/,
    );
  });

  it("team_messages está publicada, com a policy de SELECT só para authenticated", () => {
    expect(
      sql(`select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_messages';`),
    ).toBe("1");
    expect(
      sql(`select count(*) from pg_policies where tablename = 'team_messages' and cmd = 'SELECT' and 'public' = any(roles);`),
    ).toBe("0");
  });
});
