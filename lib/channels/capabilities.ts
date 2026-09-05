/**
 * O ÚNICO lugar do sistema que pode conhecer a diferença entre os canais.
 *
 * Feature nenhuma pergunta *com quem* falamos — pergunta *o que o canal permite*
 * (invariante 1 de `docs/doctrine/restricao-de-canal.md`). Cada capability abaixo
 * nasce de uma diferença real e medida entre WAHA e Meta Cloud; capability que
 * ninguém consome é código morto, e o teste de matriz reprova.
 */
import type { ChannelCapabilities, ChannelProvider } from "./types";

export type { ChannelProvider, ChannelCapabilities };

export const CHANNEL_CAPABILITIES: Record<ChannelProvider, ChannelCapabilities> = {
  // Auto-restrição: falo quando quiser, mas o WhatsApp me bane se eu abusar.
  waha: {
    freeformOutsideWindow: true,
    requiresTemplates: false,
    // Não há WABA por trás: não existe definição aprovada para gerir.
    canManageTemplates: false,
    banRisk: true,
    minIntervalMs: null,
    voiceNote: "server-convert",
    groups: "full",
    costPerMessage: false,
  },
  // Hetero-restrição: não me banem, mas a Meta me proíbe e me cobra.
  meta_cloud: {
    freeformOutsideWindow: false,
    requiresTemplates: true,
    // A Graph API cria e edita definições; o repo hoje só ESPELHA, e é essa
    // lacuna que a capability torna visível em vez de deixar implícita.
    canManageTemplates: true,
    banRisk: false,
    minIntervalMs: 6000,
    voiceNote: "opus-only",
    groups: "limited",
    costPerMessage: true,
  },
  // Mesma hetero-restrição do canal oficial, por baixo: é um BSP: a WABA é da
  // Meta, os templates são aprovados pela Meta e a janela de 24h é da Meta. O
  // intermediário muda o TRANSPORTE (quem endereça, como se autentica), não o
  // que o WhatsApp permite — e capability descreve o permitido, não o encanamento.
  //
  // As duas diferenças reais, medidas na doc do provider, não na intuição:
  //
  //  - `voiceNote: "opus-only"`. O provider tem um `voiceNote: true` no envio,
  //    mas exige ogg/opus mono explicitamente e NÃO converte — mesma restrição
  //    do canal oficial. Ler o campo booleano como "ele resolve para mim" é o
  //    erro que manda mp3 e entrega anexo de música.
  //  - `groups: "limited"`. Existe API de grupos, mas só em plano de uso e só
  //    para números fora de coexistência. Capability é o que a instalação MÉDIA
  //    pode fazer; prometer "full" aqui quebraria em quem não paga o plano.
  // `freeformOutsideWindow: false` está MEDIDO, não deduzido. A API aceita o
  // envio livre (200 + wamid) e a Meta recusa a ENTREGA depois, pelo webhook:
  //
  //   131047 Re-engagement message — "The 24-hour customer service window for
  //   this contact is closed. Send an approved template to re-open the
  //   conversation, or wait for the contact to message you first."
  //
  // O detalhe que engana: mandar um template NÃO abre a janela. Só o cliente
  // abre, respondendo. Quem ler o 200 como "enviado" acha que funciona.
  /**
   * O DIRECT DO INSTAGRAM — a hetero-restrição mais dura das quatro.
   *
   * ⚠️ DECLARADO PELA DOC, NÃO MEDIDO. Nenhuma destas linhas foi verificada
   * contra a API real: ela exige app aprovado no App Review da Meta, e o do
   * cliente ainda não passou. Onde eu só pude ler a documentação, está escrito.
   *
   *  - `freeformOutsideWindow: false` — a janela de 24h existe e é a mesma
   *    ideia da Cloud API. A DIFERENÇA que morde: lá um template aprovado
   *    reabre o assunto; aqui NÃO HÁ template. Fora da janela ninguém fala
   *    (fora tags específicas que este adapter não implementa).
   *  - `requiresTemplates: false` e `canManageTemplates: false` — não há
   *    definição aprovada a listar nem a criar. `false` aqui não significa
   *    "livre": significa que a trava é outra, e ela é o `freeformOutsideWindow`.
   *  - `banRisk: false` — quem restringe é a plataforma, pela API, e não um
   *    algoritmo antiabuso olhando padrão de uso. Ligar o anti-ban aqui gastaria
   *    throttle e warm-up contra um risco que nao existe deste lado.
   *  - `groups: "none"` — o Direct TEM conversa em grupo na interface, e a API
   *    de mensagens NÃO endereça grupo. "none" é a resposta honesta; "limited"
   *    prometeria uma saída que não existe.
   *  - `costPerMessage: false` — não há cobrança por mensagem entregue, ao
   *    contrário da Cloud API. O custo do canal é o App Review, que não é por
   *    mensagem e não entra em decisão de envio.
   */
  instagram: {
    freeformOutsideWindow: false,
    requiresTemplates: false,
    canManageTemplates: false,
    banRisk: false,
    minIntervalMs: null,
    voiceNote: "opus-only",
    groups: "none",
    costPerMessage: false,
  },
  zernio: {
    freeformOutsideWindow: false,
    requiresTemplates: true,
    canManageTemplates: true,
    banRisk: false,
    minIntervalMs: 6000,
    voiceNote: "opus-only",
    groups: "limited",
    costPerMessage: true,
  },
};

/**
 * O que assumir quando o banco NÃO diz qual é o canal — só quando a linha de
 * `channel_sessions` não pôde ser lida (a coluna é `not null default 'waha'`,
 * então uma sessão que existe sempre responde).
 *
 * Espelha o default da coluna de propósito: é o que mantém o comportamento
 * idêntico ao dos literais que as Tasks 4b/5 deixaram no código. E é o canal
 * CONSERVADOR dos dois — banRisk armado, throttle e warm-up ligados; errar para
 * o lado do meta_cloud desarmaria o anti-ban num número que pode ser banido.
 */
export const DEFAULT_CHANNEL_PROVIDER: ChannelProvider = "waha";

/**
 * Constantes nomeadas dos providers. Existem para que nenhum arquivo fora deste
 * módulo precise escrever a string — é o que o `scripts/lint-channels.ts` cobra.
 */
export const CHANNEL_PROVIDER_WAHA: ChannelProvider = "waha";
export const CHANNEL_PROVIDER_META: ChannelProvider = "meta_cloud";

/**
 * Os providers cujo NOME é uma marca que o cliente final usa.
 *
 * Existe por um defeito medido, e o mecanismo dele ja estava documentado em
 * `lib/agent-engine/guardrails/vazamento-interno.ts`: o detector de vocabulário
 * interno DERIVA a lista de providers daqui, de propósito, para "provider novo
 * entrar na cobertura sozinho". Ótima regra enquanto todo nome de provider era
 * jargão que nenhum cliente diz.
 *
 * Aí entrou um cujo nome o cliente diz o tempo todo. A guarda
 * `vazamento-interno-detector` reprovou na hora: `instagram.com/loja_da_ana`
 * — um endereço legítimo — passou a ser tratado como vazamento interno, e a
 * resposta do agente sairia com a palavra tapada. "Vi vocês no Instagram" é a
 * frase mais comum de quem escreve para uma loja.
 *
 * É exatamente o mesmo defeito que aquele arquivo já registra para `role`:
 * palavra do sistema que TAMBÉM é palavra legítima de quem está conversando.
 * A cura lá foi tirar da alternação simples; aqui é declarar quais nomes são
 * publicos.
 *
 * ⚠️ O critério é "o CLIENTE FINAL diria isto numa conversa?", e não "eu
 * conheço a marca". `zernio` é marca, e fica FORA desta lista: nenhum cliente
 * de uma loja sabe que existe um intermediário, e deixar o nome vazar contaria
 * a ele um detalhe do encanamento que não lhe diz respeito.
 */
export const PROVIDERS_DE_MARCA_PUBLICA: ReadonlySet<ChannelProvider> = new Set<ChannelProvider>([
  "instagram",
]);
export const CHANNEL_PROVIDER_ZERNIO: ChannelProvider = "zernio";

export function capabilitiesOf(provider: ChannelProvider): ChannelCapabilities {
  const caps = CHANNEL_CAPABILITIES[provider];
  // Fail-closed: provider fora da matriz não herda o default do WAHA. O tipo
  // barra em compilação; isto barra o que vem do banco em runtime.
  if (!caps) throw new Error(`unknown_channel_provider: ${provider}`);
  return caps;
}
