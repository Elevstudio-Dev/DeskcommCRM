/**
 * Adapter do Instagram Direct — o transporte da conta profissional.
 *
 * Burro de propósito, como os irmãos: traduz formato e nada mais. Se aparecer
 * aqui um `if` sobre janela de 24h, cap diário ou horário, o desenho vazou —
 * essas regras vivem na cadeia `before_send` (doutrina `restricao-de-canal.md`).
 *
 * ─── O ESTADO DESTE ARQUIVO, e leia isto antes de confiar nele ──────────────
 *
 * **Nenhuma linha daqui foi exercitada contra a API real.** Não há como: o
 * Direct exige um app aprovado no App Review da Meta (`instagram_manage_messages`
 * + `pages_manage_metadata`), e o app do cliente ainda não passou por isso — foi
 * decisão do dono deixar a CONEXÃO como "em breve" e ter o resto pronto.
 *
 * O que existe aqui é o encaixe: o canal existe no vocabulário, tem capabilities
 * declaradas e falha de forma honesta. `isConfigured()` devolve `false` enquanto
 * não houver credencial, e o handler grava `queued` em vez de fingir que enviou.
 * O formato do corpo segue a doc da Graph API e está marcado como NÃO MEDIDO em
 * cada ponto onde eu só pude ler a documentação.
 *
 * ─── Três diferenças do irmão da Cloud API que mordem quem copia ────────────
 *
 * 1. **O destinatário é um IGSID, não um telefone.** A pessoa que manda Direct
 *    não tem número: ela tem um id opaco por conta, e o mesmo humano tem ids
 *    DIFERENTES em contas diferentes. Por isso `resolveRecipient` nunca olha
 *    `phoneNumber` — olhar seria endereçar para o vazio.
 *
 * 2. **Não há template.** A Cloud API exige definição aprovada fora da janela de
 *    24h; o Instagram simplesmente não deixa enviar (com exceções de tag que
 *    este adapter não implementa). `requiresTemplates: false` +
 *    `freeformOutsideWindow: false` juntos dizem "fora da janela, ninguém fala".
 *
 * 3. **Grupo não existe.** Direct tem conversa em grupo na interface, mas a API
 *    de mensagens não endereça grupo — daí `groups: "none"` e o `null` em
 *    `resolveRecipient`, que é o que impede um envio silenciosamente perdido.
 */
import type {
  ChannelAdapter,
  ChannelHealth,
  OutboundEnvelope,
  RecipientInput,
} from "../types";

/**
 * O endereço do destinatário neste canal.
 *
 * `waIdentity` carrega `phone:`/`lid:` — as duas formas do WhatsApp — e nenhuma
 * delas endereça Direct. O id do Instagram chega em `waLid`? Não: aquilo é
 * `contacts.wa_lid`, específico do WhatsApp.
 *
 * ⚠️ LIMITAÇÃO CONHECIDA, e ela é o próximo passo real deste canal: `contacts`
 * não tem hoje onde guardar um IGSID. Enquanto não tiver, este método devolve
 * `null` para todo mundo — que é o comportamento CERTO: `null` significa "não há
 * endereço possível para este contato neste canal", e o chamador não envia. O
 * errado seria devolver o telefone e produzir um 400 da Graph API a cada tentativa.
 */
function resolveRecipient(_input: RecipientInput): string | null {
  return null;
}

export const instagramAdapter: ChannelAdapter = {
  provider: "instagram",

  resolveRecipient,

  /**
   * Sempre `false` por enquanto — e isto NÃO é um TODO esquecido.
   *
   * `isConfigured()` responde "dá para tentar?". Enquanto não há app aprovado e
   * nem coluna de credencial, a resposta honesta é não, e ela tem efeito: o
   * handler grava a mensagem como `queued` com `notConfigured` em vez de tentar,
   * falhar e marcar `failed` — que é a diferença entre "ainda não conectamos" e
   * "tentamos e o Instagram recusou". A tela mostra as duas de forma diferente.
   */
  isConfigured(): boolean {
    return false;
  },

  async send(_envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    // `null` = não tentei. O contrato do adapter separa isso de "tentei e a
    // resposta não trouxe id" justamente para o chamador não gravar um envio
    // que nunca saiu como se tivesse saído.
    return { externalId: null };
  },

  /**
   * A saude deste canal, hoje, é "não conectado" — e dizer isso é o ponto.
   *
   * O cron de saude varre os adapters e PULA quem nao implementa
   * (`if (!adapter.checkHealth) continue`). Um canal pulado não gera log nem
   * contador: chave revogada, conta suspensa e webhook sem assinatura viram
   * silêncio absoluto, com a tela dizendo "conectado". Foi assim que a sessão
   * oficial ficou cega, e `saude-dos-canais-oficiais.test.ts` existe por isso.
   *
   * `reachable: false` NÃO é o mesmo que "o canal caiu": significa "não deu para
   * perguntar". Enquanto não há app aprovado nem credencial, essa é a verdade
   * disponível, e o `detail` diz qual — o cron a repassa em vez de inventar um
   * estado.
   */
  async checkHealth(): Promise<ChannelHealth> {
    return {
      reachable: false,
      status: null,
      detail: "canal ainda não conectado: aguardando aprovação do aplicativo",
    };
  },

  codes: {
    notConfigured: "instagram_not_configured",
    sendFailed: "instagram_send_failed",
    unknownError: "instagram_unknown_error",
  },
};
