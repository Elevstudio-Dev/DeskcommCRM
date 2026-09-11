/**
 * O MENU DE PRIMEIRO CONTATO — a regra, sem banco e sem canal.
 *
 * Um cliente novo escreve. Se a organização tem o menu ligado e ≥ 2 setores,
 * o sistema responde a saudação com a lista numerada:
 *
 *     Olá! Para agilizar seu atendimento, me diga com qual setor você quer falar:
 *
 *     1 - Assistência
 *     2 - Financeiro
 *     3 - Recepção
 *
 *     Responda com o número.
 *
 * A próxima mensagem do cliente é lida contra a lista — número ou nome, sem
 * acento, sem caixa. Casou: a conversa vai para o setor. Não casou: um
 * lembrete, uma vez; depois cai no setor padrão (ou fica sem setor, se não há
 * padrão), e a fila humana assume. Enquanto o menu aguarda, o agente de IA não
 * responde naquela conversa: a escolha de setor vem antes.
 *
 * Tudo aqui é puro. `decidirMenu` recebe o que o banco sabe da conversa e
 * devolve O QUE FAZER; quem faz é `lib/setores/aplicar-menu.ts`, chamado da
 * ingestão (`lib/channels/pos-entrada.ts`) — sem nome de provedor em lugar
 * nenhum, como manda a doutrina de canal.
 */
import type { ConfiguracaoDeSetores } from "@/lib/schemas/setores";

export interface SetorDoMenu {
  id: string;
  name: string;
  position: number;
}

export interface OpcaoDoMenu {
  numero: number;
  sector_id: string;
  nome: string;
}

/**
 * O que fica gravado em `conversations.metadata.menu_setores` entre uma
 * mensagem e a outra. É a memória do menu: sem ela, a resposta "2" do cliente
 * seria só uma mensagem com um número dentro.
 */
export type EstadoDoMenu =
  | {
      estado: "aguardando";
      enviado_em: string;
      opcoes: OpcaoDoMenu[];
      /** Quantos lembretes já foram. Um só, por decisão: o segundo é insistência. */
      lembretes: number;
    }
  | {
      estado: "resolvido";
      resultado: "escolhido" | "padrao" | "sem_setor";
      sector_id: string | null;
      em: string;
    };

export interface ConversaParaOMenu {
  sector_id: string | null;
  assigned_to_user_id: string | null;
  is_group: boolean;
  status: string;
  /** `null` = nunca respondemos: é o que define "primeiro contato". */
  last_outbound_at: string | null;
  menu: EstadoDoMenu | null;
}

export interface ContextoDoMenu {
  config: ConfiguracaoDeSetores;
  /** Só os ativos (`archived_at is null`), em qualquer ordem — a função ordena. */
  setores: SetorDoMenu[];
  conversa: ConversaParaOMenu;
  /** O texto da mensagem que acabou de chegar. `null` = mídia sem legenda. */
  texto: string | null;
  agora: Date;
}

export type DecisaoDoMenu =
  | { tipo: "nada"; motivo: string }
  | { tipo: "enviar_menu"; texto: string; opcoes: OpcaoDoMenu[] }
  | { tipo: "escolhido"; sector_id: string; nome: string; texto: string }
  | { tipo: "lembrar"; texto: string }
  | { tipo: "padrao"; sector_id: string | null };

/** As opções, na ordem da tela de setores, numeradas de 1. */
export function opcoesDoMenu(setores: SetorDoMenu[]): OpcaoDoMenu[] {
  return [...setores]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"))
    .map((s, i) => ({ numero: i + 1, sector_id: s.id, nome: s.name }));
}

function linhasDasOpcoes(opcoes: OpcaoDoMenu[]): string {
  return opcoes.map((o) => `${o.numero} - ${o.nome}`).join("\n");
}

export function montarTextoDoMenu(saudacao: string, opcoes: OpcaoDoMenu[]): string {
  return `${saudacao.trim()}\n\n${linhasDasOpcoes(opcoes)}\n\nResponda com o número.`;
}

export function montarTextoDoLembrete(lembrete: string, opcoes: OpcaoDoMenu[]): string {
  return `${lembrete.trim()}\n\n${linhasDasOpcoes(opcoes)}`;
}

export function montarConfirmacao(modelo: string, nomeDoSetor: string): string {
  return modelo.replace(/\{setor\}/gi, nomeDoSetor);
}

/** Sem acento, sem caixa, sem pontuação nas pontas — para comparar o que o cliente escreveu. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que o cliente quis dizer. Número primeiro ("2", "opção 2", "2 - financeiro",
 * "quero o 2"); depois o nome ("financeiro", "com o financeiro por favor").
 *
 * Ambiguidade é `null`, e não um chute: dois números diferentes na mensagem
 * ("2 ou 3?") ou dois nomes de setor casando ("assistência ou financeiro?")
 * viram lembrete, que é mais barato que mandar a pessoa para a fila errada.
 */
export function interpretarResposta(texto: string | null, opcoes: OpcaoDoMenu[]): OpcaoDoMenu | null {
  if (!texto) return null;
  const limpo = normalizar(texto);
  if (limpo === "") return null;

  const numeros = [...new Set((limpo.match(/\d{1,2}/g) ?? []).map((n) => Number(n)))];
  if (numeros.length === 1) {
    const porNumero = opcoes.find((o) => o.numero === numeros[0]);
    if (porNumero) return porNumero;
  }
  if (numeros.length > 1) return null;

  const porNome = opcoes.filter((o) => {
    const nome = normalizar(o.nome);
    return nome !== "" && (limpo === nome || limpo.includes(nome) || (limpo.length >= 4 && nome.includes(limpo)));
  });
  return porNome.length === 1 ? porNome[0]! : null;
}

export function decidirMenu(ctx: ContextoDoMenu): DecisaoDoMenu {
  const { config, conversa } = ctx;
  if (!config.menu_ativo) return { tipo: "nada", motivo: "menu_desligado" };
  if (conversa.is_group) return { tipo: "nada", motivo: "grupo" };
  if (conversa.sector_id) return { tipo: "nada", motivo: "ja_tem_setor" };
  if (conversa.status === "closed" || conversa.status === "archived") {
    return { tipo: "nada", motivo: "conversa_encerrada" };
  }

  const menu = conversa.menu;
  if (menu?.estado === "aguardando") {
    const escolha = interpretarResposta(ctx.texto, menu.opcoes);
    if (escolha) {
      return {
        tipo: "escolhido",
        sector_id: escolha.sector_id,
        nome: escolha.nome,
        texto: montarConfirmacao(config.confirmacao, escolha.nome),
      };
    }
    if (menu.lembretes < 1) {
      return { tipo: "lembrar", texto: montarTextoDoLembrete(config.lembrete, menu.opcoes) };
    }
    return { tipo: "padrao", sector_id: config.setor_padrao_id };
  }
  if (menu?.estado === "resolvido") return { tipo: "nada", motivo: "menu_ja_resolvido" };

  const opcoes = opcoesDoMenu(ctx.setores);
  if (opcoes.length < 2) return { tipo: "nada", motivo: "menos_de_dois_setores" };
  if (conversa.assigned_to_user_id) return { tipo: "nada", motivo: "ja_tem_responsavel" };
  // Já respondemos alguma vez: não é primeiro contato, e mandar o menu no meio
  // de uma conversa em andamento é o robô atropelando a pessoa.
  if (conversa.last_outbound_at) return { tipo: "nada", motivo: "nao_e_primeiro_contato" };

  return { tipo: "enviar_menu", texto: montarTextoDoMenu(config.saudacao, opcoes), opcoes };
}

/** Lê `metadata.menu_setores` sem confiar no formato — lixo vira `null`. */
export function lerEstadoDoMenu(metadata: unknown): EstadoDoMenu | null {
  if (!metadata || typeof metadata !== "object") return null;
  const bruto = (metadata as { menu_setores?: unknown }).menu_setores;
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Record<string, unknown>;
  if (m.estado === "aguardando" && Array.isArray(m.opcoes)) {
    const opcoes = m.opcoes.filter(
      (o): o is OpcaoDoMenu =>
        !!o &&
        typeof o === "object" &&
        typeof (o as OpcaoDoMenu).numero === "number" &&
        typeof (o as OpcaoDoMenu).sector_id === "string" &&
        typeof (o as OpcaoDoMenu).nome === "string",
    );
    return {
      estado: "aguardando",
      enviado_em: typeof m.enviado_em === "string" ? m.enviado_em : "",
      opcoes,
      lembretes: typeof m.lembretes === "number" ? m.lembretes : 0,
    };
  }
  if (m.estado === "resolvido") {
    return {
      estado: "resolvido",
      resultado: m.resultado === "escolhido" || m.resultado === "padrao" ? m.resultado : "sem_setor",
      sector_id: typeof m.sector_id === "string" ? m.sector_id : null,
      em: typeof m.em === "string" ? m.em : "",
    };
  }
  return null;
}
