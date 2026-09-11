/**
 * O MENU DE SETORES — o lado que toca o banco e o canal, com o banco de mentira.
 *
 * O que estes casos prendem:
 *
 *  - a MEMÓRIA do menu é gravada ANTES do envio (se o envio falhar, a próxima
 *    resposta do cliente ainda é lida como resposta ao menu);
 *  - a escolha passa pela ÚNICA porta (`fn_conversation_set_sector`, motivo
 *    `sector_menu`) e acorda o rodízio do setor (`routing_requested`);
 *  - enquanto o menu está no ar, o agente é SEGURADO; depois do padrão, não;
 *  - qualquer erro vira log e "não segure" — a ingestão nunca cai por aqui.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn(async () => ({}));
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: (...a: unknown[]) => enviar(...(a as [])),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { aplicarMenuDeSetores } from "@/lib/setores/aplicar-menu";

const ORG = "00000000-0000-4000-8000-00000000000a";
const CONV = "00000000-0000-4000-8000-0000000000c0";
const S_FIN = "00000000-0000-4000-8000-00000000f1a0";
const S_ASS = "00000000-0000-4000-8000-0000000000a5";

/** O que o banco "tem" neste caso — cada caso ajusta. */
let settings: Record<string, unknown> = { setores: { menu_ativo: true } };
let conversa: Record<string, unknown> = {
  sector_id: null,
  assigned_to_user_id: null,
  is_group: false,
  status: "open",
  last_outbound_at: null,
  metadata: {},
};
const setores: Array<{ id: string; name: string; position: number }> = [
  { id: S_ASS, name: "Assistência", position: 0 },
  { id: S_FIN, name: "Financeiro", position: 1 },
];
/** A sequência do que ACONTECEU, na ordem. */
let sequencia: string[] = [];
let ultimoUpdate: Record<string, unknown> | null = null;
let rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
let quebrarUpdate = false;

function cadeiaDeLeitura(resposta: unknown) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) c[m] = self;
  c.maybeSingle = async () => ({ data: resposta, error: null });
  c.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: resposta, error: null }).then(resolve);
  return c;
}

const admin = {
  from(tabela: string) {
    if (tabela === "organizations") return cadeiaDeLeitura({ settings });
    if (tabela === "sectors") return cadeiaDeLeitura(setores);
    if (tabela === "conversations") {
      return {
        ...cadeiaDeLeitura(conversa),
        update(payload: Record<string, unknown>) {
          ultimoUpdate = payload;
          const c: Record<string, unknown> = {};
          c.eq = () => c;
          c.then = (resolve: (v: unknown) => void) => {
            sequencia.push("update:conversations");
            return Promise.resolve({ error: quebrarUpdate ? { message: "boom" } : null }).then(resolve);
          };
          return c;
        },
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  },
  async rpc(nome: string, args: Record<string, unknown>) {
    rpcs.push({ nome, args });
    sequencia.push(`rpc:${nome === "emit_event" ? String(args.p_event_type) : nome}`);
    return { data: null, error: null };
  },
} as never;

beforeEach(() => {
  sequencia = [];
  ultimoUpdate = null;
  rpcs = [];
  quebrarUpdate = false;
  enviar.mockClear();
  enviar.mockImplementation(async () => {
    sequencia.push("enviar");
    return {};
  });
  settings = { setores: { menu_ativo: true, setor_padrao_id: S_ASS } };
  conversa = { sector_id: null, assigned_to_user_id: null, is_group: false, status: "open", last_outbound_at: null, metadata: {} };
});

const entrada = (texto: string | null) => ({ organizationId: ORG, conversationId: CONV, texto, requestId: "req-1" });

describe("primeiro contato", () => {
  it("grava a memória ANTES de enviar, manda o menu e SEGURA o agente", async () => {
    const r = await aplicarMenuDeSetores(admin, entrada("oi"));
    expect(r).toEqual({ segurarAgente: true, decisao: "enviar_menu" });
    expect(sequencia).toEqual(["update:conversations", "enviar"]);
    const menu = (ultimoUpdate?.metadata as { menu_setores: { estado: string; opcoes: unknown[]; lembretes: number } }).menu_setores;
    expect(menu.estado).toBe("aguardando");
    expect(menu.opcoes).toHaveLength(2);
    expect(menu.lembretes).toBe(0);
    const [, ctx, msg] = enviar.mock.calls[0] as unknown as [unknown, { actor: { type: string; id: string } }, { body: string }];
    expect(ctx.actor).toEqual({ type: "webhook_source", id: "menu_setores" });
    expect(msg.body).toContain("1 - Assistência");
  });

  it("menu desligado: não lê nem a conversa, e não segura", async () => {
    settings = {};
    const r = await aplicarMenuDeSetores(admin, entrada("oi"));
    expect(r).toEqual({ segurarAgente: false, decisao: "menu_desligado" });
    expect(sequencia).toEqual([]);
  });
});

describe("a resposta do cliente", () => {
  const AGUARDANDO = {
    menu_setores: {
      estado: "aguardando",
      enviado_em: "t",
      opcoes: [
        { numero: 1, sector_id: S_ASS, nome: "Assistência" },
        { numero: 2, sector_id: S_FIN, nome: "Financeiro" },
      ],
      lembretes: 0,
    },
  };

  it("escolheu: set_sector(sector_menu) → memória resolvida → confirmação → rodízio do setor", async () => {
    conversa = { ...conversa, metadata: AGUARDANDO };
    const r = await aplicarMenuDeSetores(admin, entrada("2"));
    expect(r).toEqual({ segurarAgente: true, decisao: "escolhido" });
    expect(sequencia).toEqual([
      "rpc:fn_conversation_set_sector",
      "rpc:conversation.routing_requested",
      "update:conversations",
      "enviar",
    ]);
    expect(rpcs[0]?.args).toMatchObject({ p_sector_id: S_FIN, p_reason: "sector_menu", p_organization_id: ORG });
    const menu = (ultimoUpdate?.metadata as { menu_setores: { estado: string; resultado: string; sector_id: string } }).menu_setores;
    expect(menu).toMatchObject({ estado: "resolvido", resultado: "escolhido", sector_id: S_FIN });
    const [, , msg] = enviar.mock.calls[0] as unknown as [unknown, unknown, { body: string }];
    expect(msg.body).toContain("Financeiro");
  });

  it("não entendeu: lembra uma vez e conta o lembrete", async () => {
    conversa = { ...conversa, metadata: AGUARDANDO };
    const r = await aplicarMenuDeSetores(admin, entrada("quero falar com alguém"));
    expect(r).toEqual({ segurarAgente: true, decisao: "lembrar" });
    const menu = (ultimoUpdate?.metadata as { menu_setores: { lembretes: number } }).menu_setores;
    expect(menu.lembretes).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("não entendeu de novo: cai no padrão, NÃO manda mensagem e SOLTA o agente", async () => {
    conversa = { ...conversa, metadata: { menu_setores: { ...AGUARDANDO.menu_setores, lembretes: 1 } } };
    const r = await aplicarMenuDeSetores(admin, entrada("???"));
    expect(r).toEqual({ segurarAgente: false, decisao: "padrao" });
    expect(rpcs[0]?.args).toMatchObject({ p_sector_id: S_ASS, p_reason: "sector_menu" });
    expect(enviar).not.toHaveBeenCalled();
    const menu = (ultimoUpdate?.metadata as { menu_setores: { resultado: string } }).menu_setores;
    expect(menu.resultado).toBe("padrao");
  });
});

describe("nada aqui derruba a ingestão", () => {
  it("erro ao gravar vira log e 'não segure' — a conversa segue sem menu", async () => {
    quebrarUpdate = true;
    const r = await aplicarMenuDeSetores(admin, entrada("oi"));
    expect(r).toEqual({ segurarAgente: false, decisao: "erro" });
    // O envio nunca aconteceu: a memória vem antes, e ela falhou.
    expect(enviar).not.toHaveBeenCalled();
  });

  it("um banco que não tem as tabelas (instalação sem a 0213) não quebra nada", async () => {
    const semTabelas = { from: () => { throw new Error("relation sectors does not exist"); } } as never;
    const r = await aplicarMenuDeSetores(semTabelas, entrada("oi"));
    expect(r.segurarAgente).toBe(false);
  });
});
