/**
 * O MENU DE PRIMEIRO CONTATO — a regra, provada sem banco.
 *
 * O que estes casos prendem:
 *
 *  - o menu só dispara no PRIMEIRO contato: ligado, ≥ 2 setores, conversa sem
 *    setor, sem responsável, sem resposta nossa, e não é grupo — cada condição
 *    negada sozinha derruba o disparo;
 *  - a resposta do cliente é lida com tolerância (número, nome, acento, ruído)
 *    e ambiguidade vira lembrete, nunca chute;
 *  - um lembrete só; depois, o setor padrão — ou nenhum, se não há padrão.
 */
import { describe, expect, it } from "vitest";

import { configuracaoDeSetoresSchema, lerConfiguracaoDeSetores } from "@/lib/schemas/setores";
import {
  decidirMenu,
  interpretarResposta,
  lerEstadoDoMenu,
  montarTextoDoMenu,
  opcoesDoMenu,
  type ContextoDoMenu,
  type EstadoDoMenu,
} from "@/lib/setores/menu";

const S_FIN = "00000000-0000-4000-8000-00000000f1a0";
const S_ASS = "00000000-0000-4000-8000-0000000000a5";
const S_REC = "00000000-0000-4000-8000-00000000000e";
const SETORES = [
  { id: S_FIN, name: "Financeiro", position: 2 },
  { id: S_ASS, name: "Assistência", position: 1 },
  { id: S_REC, name: "Recepção", position: 3 },
];
const OPCOES = opcoesDoMenu(SETORES);
const AGORA = new Date("2026-09-11T12:00:00Z");

function ctx(
  sobrescreve: Omit<Partial<ContextoDoMenu>, "conversa"> & { conversa?: Partial<ContextoDoMenu["conversa"]> } = {},
): ContextoDoMenu {
  const { conversa, ...resto } = sobrescreve;
  return {
    config: configuracaoDeSetoresSchema.parse({ menu_ativo: true, setor_padrao_id: S_REC }),
    setores: SETORES,
    texto: "oi, bom dia",
    agora: AGORA,
    ...resto,
    conversa: {
      sector_id: null,
      assigned_to_user_id: null,
      is_group: false,
      status: "open",
      last_outbound_at: null,
      menu: null,
      ...conversa,
    },
  };
}

const AGUARDANDO: EstadoDoMenu = { estado: "aguardando", enviado_em: "2026-09-11T11:59:00Z", opcoes: OPCOES, lembretes: 0 };

describe("opcoesDoMenu / montarTextoDoMenu", () => {
  it("numera na ordem da posição, não na ordem do array", () => {
    expect(OPCOES.map((o) => `${o.numero}:${o.nome}`)).toEqual(["1:Assistência", "2:Financeiro", "3:Recepção"]);
  });

  it("o texto é saudação, lista numerada e a instrução", () => {
    expect(montarTextoDoMenu("Olá! Escolha:", OPCOES)).toBe(
      "Olá! Escolha:\n\n1 - Assistência\n2 - Financeiro\n3 - Recepção\n\nResponda com o número.",
    );
  });
});

describe("interpretarResposta", () => {
  it.each([
    ["2", S_FIN],
    ["  2  ", S_FIN],
    ["opção 2", S_FIN],
    ["2 - financeiro", S_FIN],
    ["quero o 3 por favor", S_REC],
    ["financeiro", S_FIN],
    ["FINANCEIRO!!", S_FIN],
    ["assistencia", S_ASS],
    ["com a assistência, por favor", S_ASS],
    ["recepcao", S_REC],
  ])("%j → %s", (texto, esperado) => {
    expect(interpretarResposta(texto, OPCOES)?.sector_id).toBe(esperado);
  });

  it.each([
    ["2 ou 3?"],
    ["assistência ou financeiro?"],
    ["9"],
    ["oi"],
    ["quero falar com alguém"],
    [""],
    [null],
  ])("%j é ambíguo ou não casa → null", (texto) => {
    expect(interpretarResposta(texto, OPCOES)).toBeNull();
  });

  it("número dentro de um telefone não é escolha", () => {
    // Dois ou mais números na mensagem → ambíguo → null (vira lembrete).
    expect(interpretarResposta("meu pedido é 12 34", OPCOES)).toBeNull();
  });
});

describe("decidirMenu — o disparo", () => {
  it("primeiro contato, menu ligado, ≥2 setores: ENVIA o menu", () => {
    const d = decidirMenu(ctx());
    expect(d.tipo).toBe("enviar_menu");
    if (d.tipo === "enviar_menu") {
      expect(d.opcoes).toHaveLength(3);
      expect(d.texto).toContain("1 - Assistência");
    }
  });

  it.each([
    ["menu desligado", { config: configuracaoDeSetoresSchema.parse({ menu_ativo: false }) }, "menu_desligado"],
    ["grupo", { conversa: { is_group: true } }, "grupo"],
    ["já tem setor", { conversa: { sector_id: S_FIN } }, "ja_tem_setor"],
    ["já tem responsável", { conversa: { assigned_to_user_id: "u1" } }, "ja_tem_responsavel"],
    ["já respondemos antes", { conversa: { last_outbound_at: "2026-09-10T10:00:00Z" } }, "nao_e_primeiro_contato"],
    ["conversa fechada", { conversa: { status: "closed" } }, "conversa_encerrada"],
    ["só um setor", { setores: [SETORES[0]!] }, "menos_de_dois_setores"],
    ["já resolvido", { conversa: { menu: { estado: "resolvido", resultado: "sem_setor", sector_id: null, em: "" } } }, "menu_ja_resolvido"],
  ] as const)("%s → nada", (_nome, sobrescreve, motivo) => {
    const d = decidirMenu(ctx(sobrescreve as never));
    expect(d).toEqual({ tipo: "nada", motivo });
  });
});

describe("decidirMenu — a resposta", () => {
  it("cliente escolheu: setor + confirmação com o nome", () => {
    const d = decidirMenu(ctx({ texto: "2", conversa: { menu: AGUARDANDO } }));
    expect(d).toMatchObject({ tipo: "escolhido", sector_id: S_FIN, nome: "Financeiro" });
    if (d.tipo === "escolhido") expect(d.texto).toContain("Financeiro");
  });

  it("não entendeu, sem lembrete ainda: LEMBRA uma vez", () => {
    const d = decidirMenu(ctx({ texto: "quero falar com alguém", conversa: { menu: AGUARDANDO } }));
    expect(d.tipo).toBe("lembrar");
    if (d.tipo === "lembrar") expect(d.texto).toContain("1 - Assistência");
  });

  it("não entendeu de novo: cai no setor PADRÃO e para de insistir", () => {
    const d = decidirMenu(ctx({ texto: "???", conversa: { menu: { ...AGUARDANDO, lembretes: 1 } } }));
    expect(d).toEqual({ tipo: "padrao", sector_id: S_REC });
  });

  it("sem setor padrão configurado, o padrão é NENHUM — a fila humana assume", () => {
    const d = decidirMenu(
      ctx({
        texto: "???",
        config: configuracaoDeSetoresSchema.parse({ menu_ativo: true }),
        conversa: { menu: { ...AGUARDANDO, lembretes: 1 } },
      }),
    );
    expect(d).toEqual({ tipo: "padrao", sector_id: null });
  });

  it("mídia sem legenda enquanto aguarda: conta como não entendido", () => {
    const d = decidirMenu(ctx({ texto: null, conversa: { menu: AGUARDANDO } }));
    expect(d.tipo).toBe("lembrar");
  });

  it("a escolha vale mesmo se a conversa ganhou responsável no meio — o setor é a decisão do cliente", () => {
    // O rodízio pode ter atribuído alguém entre o menu e a resposta. Quem
    // resolve isso é `fn_conversation_set_sector`, que devolve à fila do setor.
    const d = decidirMenu(ctx({ texto: "1", conversa: { menu: AGUARDANDO, assigned_to_user_id: "u1" } }));
    expect(d.tipo).toBe("escolhido");
  });
});

describe("lerEstadoDoMenu / lerConfiguracaoDeSetores — tolerantes a lixo", () => {
  it("metadata sem menu → null; lixo → null; estado válido → volta inteiro", () => {
    expect(lerEstadoDoMenu({})).toBeNull();
    expect(lerEstadoDoMenu({ menu_setores: "x" })).toBeNull();
    expect(lerEstadoDoMenu({ menu_setores: { estado: "aguardando", opcoes: [{ numero: 1, sector_id: "a", nome: "A" }, "lixo"], lembretes: 1, enviado_em: "t" } })).toEqual({
      estado: "aguardando",
      opcoes: [{ numero: 1, sector_id: "a", nome: "A" }],
      lembretes: 1,
      enviado_em: "t",
    });
  });

  it("organização que nunca abriu a tela tem o menu DESLIGADO", () => {
    expect(lerConfiguracaoDeSetores(null).menu_ativo).toBe(false);
    expect(lerConfiguracaoDeSetores({ setores: { menu_ativo: "sim" } }).menu_ativo).toBe(false);
    expect(lerConfiguracaoDeSetores({ setores: { menu_ativo: true } }).menu_ativo).toBe(true);
  });
});
