import { PROVEDOR_POR_ID } from "@/lib/ai/pontos/provedores";

/**
 * O que dizer a quem cadastrou uma chave que o provedor recusou.
 *
 * ─── O defeito que isto conserta ───────────────────────────────────────────
 *
 * A tela mostrava o código cru. `CredentialCard.tsx` imprimia
 * `validation_error` direto e o diálogo fazia
 * `toast.error("Validação falhou: auth_failed_401")`. Quem cadastrou a chave
 * recebia uma string de máquina e nenhum passo seguinte — e o passo seguinte
 * era o que a pessoa foi procurar ali.
 *
 * Custa caro porque é a PRIMEIRA parede do produto: sem chave o assistente não
 * responde nada, e "auth_failed_401" não diz se o problema é a chave, a conta,
 * o saldo ou a internet do servidor. Medido em 2026-09-03 com uma chave real de
 * OpenRouter recusada: a tela dizia o código, o provedor dizia "User not
 * found", e nenhum dos dois aparecia junto do que fazer a respeito.
 *
 * ─── A regra: texto de gente E motivo técnico, juntos ──────────────────────
 *
 * É a mesma doutrina que a Central de avisos já segue
 * (`tests/e2e/central-de-avisos-capacidades.spec.ts`): o rótulo conta o que
 * aconteceu, e o motivo técnico fica ao lado para quem for investigar. Trocar
 * um pelo outro perde metade — aviso sem motivo não ajuda a consertar, e
 * motivo sem aviso não é para ninguém. Por isso este módulo NÃO consome o
 * código: quem chama continua mostrando os dois.
 *
 * ─── Por que os textos são chaves do dicionário ────────────────────────────
 *
 * `t()` recebe o português como chave (`lib/i18n/dicionario.ts`). Como aqui
 * elas chegam por VARIÁVEL, o guarda de AST (`i18n-espanhol-cobre-a-tela`) não
 * as enxerga: ele encontra `t(motivo.titulo)` e não tem como saber o que
 * `titulo` vale. Esse buraco é fechado à mão por
 * `motivo-da-recusa.test.ts`, que cruza TEXTOS_DE_RECUSA com o DICIONARIO.
 */

export interface MotivoDaRecusa {
  /** O que aconteceu, na língua de quem opera. Chave do dicionário. */
  titulo: string;
  /** O próximo passo, concreto. Chave do dicionário. */
  comoResolver: string;
  /**
   * Endereço onde se gera outra chave — derivado de `PROVEDORES`, não repetido.
   * `null` quando trocar a chave não é o que resolve.
   */
  ondePegarAChave: string | null;
}

const RECUSADA = "A chave foi recusada pelo provedor";
const LIMITE = "O provedor limitou o uso desta chave";
const FORA_DO_AR = "O provedor está fora do ar";
const SEM_CONTATO = "Não consegui falar com o provedor";
const SEM_VALIDACAO = "Este provedor ainda não tem validação automática";
const RECUSOU_A_CONSULTA = "O provedor recusou a consulta";

const TROQUE_A_CHAVE = "Gere outra chave no painel do provedor e cole aqui.";
const ESPERE = "Espere alguns minutos e valide de novo. Se continuar, confira o limite de uso na sua conta do provedor.";
const NAO_E_VOCE = "Não é a sua chave: o problema está do lado deles. Valide de novo daqui a alguns minutos.";
const CONFIRA_A_REDE = "Confira se este servidor tem saída para a internet e valide de novo.";
const GUARDADA_SEM_CONFERIR = "A chave foi guardada, mas não dá para conferir por aqui se ela funciona.";
const CONFIRA_NO_PAINEL = "Confira a chave no painel do provedor e cole de novo.";

/**
 * Tudo que este módulo pode devolver como texto. Existe para o teste cruzar
 * com o dicionário — e é por isso que os textos são constantes nomeadas em vez
 * de literais espalhados pelos `return`s.
 */
export const TEXTOS_DE_RECUSA = [
  RECUSADA,
  LIMITE,
  FORA_DO_AR,
  SEM_CONTATO,
  SEM_VALIDACAO,
  RECUSOU_A_CONSULTA,
  TROQUE_A_CHAVE,
  ESPERE,
  NAO_E_VOCE,
  CONFIRA_A_REDE,
  GUARDADA_SEM_CONFERIR,
  CONFIRA_NO_PAINEL,
] as const;

/** `provider_status_429` → 429. Devolve `null` para qualquer outra forma. */
function statusDoCodigo(codigo: string): number | null {
  const m = /^provider_status_(\d{3})$/.exec(codigo);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traduz o código guardado em `ai_provider_credentials.validation_error`.
 *
 * `null` quando não há o que explicar — credencial válida, ou ainda não
 * validada. Quem chama trata isso como "não mostra nada", que é diferente de
 * mostrar uma explicação vazia.
 */
export function motivoDaRecusa(provedor: string, codigo: string | null | undefined): MotivoDaRecusa | null {
  const cru = (codigo ?? "").trim();
  if (cru.length === 0) return null;

  const onde = PROVEDOR_POR_ID.get(provedor)?.ondePegarAChave ?? null;
  const status = statusDoCodigo(cru);

  // Chave recusada. O 400 entra aqui junto do 401/403 por medida, não por
  // simetria: o Google devolve 400 (API_KEY_INVALID) para chave inválida, e
  // não 401 — conferido em 2026-09-03 com uma chave falsa contra
  // `generativelanguage.googleapis.com/v1beta/models`. Deixar o 400 no ramo
  // genérico mandaria o caso MAIS COMUM do provedor gratuito para a mensagem
  // que menos ajuda.
  if (cru.startsWith("auth_failed") || status === 400 || status === 401 || status === 403) {
    return { titulo: RECUSADA, comoResolver: onde ? TROQUE_A_CHAVE : CONFIRA_NO_PAINEL, ondePegarAChave: onde };
  }

  if (status === 429) {
    return { titulo: LIMITE, comoResolver: ESPERE, ondePegarAChave: null };
  }

  if (status !== null && status >= 500) {
    return { titulo: FORA_DO_AR, comoResolver: NAO_E_VOCE, ondePegarAChave: null };
  }

  // `network_error` é o que o validador devolve quando o `fetch` estoura, e
  // `AbortError`/`TimeoutError` são o `err.name` de um tempo limite. Todos
  // significam a mesma coisa para quem opera: a mensagem não chegou lá.
  if (cru === "network_error" || cru === "AbortError" || cru === "TimeoutError") {
    return { titulo: SEM_CONTATO, comoResolver: CONFIRA_A_REDE, ondePegarAChave: null };
  }

  if (cru.startsWith("unknown_provider")) {
    return { titulo: SEM_VALIDACAO, comoResolver: GUARDADA_SEM_CONFERIR, ondePegarAChave: null };
  }

  // Fallback. Não inventa diagnóstico: diz que o provedor recusou e manda
  // conferir. O código continua na tela ao lado, que é quem carrega o detalhe.
  return { titulo: RECUSOU_A_CONSULTA, comoResolver: CONFIRA_NO_PAINEL, ondePegarAChave: onde };
}
