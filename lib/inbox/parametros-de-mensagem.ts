/**
 * Parâmetros de uma mensagem pronta — a regra, sem tela.
 *
 * Uma mensagem pronta pode ter `{{chave}}` no meio do texto. Três chaves são
 * AUTOMÁTICAS e chegam preenchidas de quem está na conversa; qualquer outra é
 * LIVRE e vira um campo para a pessoa preencher na hora de usar:
 *
 *   "Olá {{nome}}, aqui é {{atendente}}. Seu pedido {{numero_pedido}} saiu."
 *     → nome e atendente vêm sozinhos; numero_pedido é perguntado.
 *
 * Antes disto (`template-vars.ts`) só `{{nome}}` e `{{primeiro_nome}}` eram
 * conhecidos, e qualquer outra chave ficava LITERAL no texto — e ia assim para
 * o celular do cliente se ninguém notasse. Agora chave desconhecida não é
 * erro: é pergunta.
 *
 * Tudo aqui é puro. O composer decide quando abrir a janelinha com
 * `precisaDeJanela`, e o formulário da mensagem mostra o que ela pede com
 * `extrairParametros`.
 */

/** A chave como está no texto, sem chaves nem espaços — e em minúsculas. */
export type ChaveDeParametro = string;

export type OrigemDoParametro = "contato" | "atendente" | "livre";

export interface Parametro {
  chave: ChaveDeParametro;
  /** O que a pessoa lê no campo — ver `rotuloDe`. */
  rotulo: string;
  origem: OrigemDoParametro;
}

/**
 * `\p{L}` e `\p{N}`, e não `[a-zA-Z_]`: quem escreve a mensagem escreve em
 * português, e `{{número_do_pedido}}` tem de valer tanto quanto
 * `{{numero_do_pedido}}`. Espaço dentro das chaves é tolerado; espaço no MEIO
 * da chave não é (aí seriam duas palavras, e `{{numero pedido}}` fica
 * literal — o formulário avisa).
 */
const PADRAO = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

/**
 * As chaves automáticas e de onde vêm. `nome_cliente` e `cliente` são apelidos
 * de `nome`: são as formas que aparecem quando alguém escreve a mensagem sem
 * consultar a lista — e a lista existe para ser dispensável.
 */
const AUTOMATICAS: Record<string, { origem: Exclude<OrigemDoParametro, "livre">; rotulo: string }> = {
  nome: { origem: "contato", rotulo: "Nome do cliente" },
  nome_cliente: { origem: "contato", rotulo: "Nome do cliente" },
  cliente: { origem: "contato", rotulo: "Nome do cliente" },
  primeiro_nome: { origem: "contato", rotulo: "Primeiro nome do cliente" },
  atendente: { origem: "atendente", rotulo: "Nome do atendente" },
};

/** As chaves automáticas, na ordem em que o formulário as oferece. */
export const CHAVES_AUTOMATICAS: ReadonlyArray<{ chave: string; rotulo: string }> = [
  { chave: "nome", rotulo: "Nome do cliente" },
  { chave: "primeiro_nome", rotulo: "Primeiro nome do cliente" },
  { chave: "atendente", rotulo: "Nome do atendente" },
];

/** Normaliza a chave como o texto a escreveu para a forma canônica de busca. */
function normalizar(bruta: string): ChaveDeParametro {
  return bruta.toLowerCase();
}

/**
 * "numero_pedido" → "Numero pedido"; "número_do_pedido" → "Número do pedido".
 * Não inventa acento nem preposição: o rótulo é a chave lida por gente, e
 * quem quer "Número do pedido" escreve a chave assim.
 */
export function rotuloDe(chave: ChaveDeParametro): string {
  const auto = AUTOMATICAS[normalizar(chave)];
  if (auto) return auto.rotulo;
  const texto = chave.replace(/_+/g, " ").trim();
  if (texto === "") return chave;
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

/**
 * Os parâmetros do texto, na ORDEM em que aparecem, sem repetição. A ordem
 * importa porque é a ordem dos campos na janelinha — e a pessoa preenche
 * lendo a mensagem de cima para baixo.
 */
export function extrairParametros(corpo: string): Parametro[] {
  const vistos = new Set<ChaveDeParametro>();
  const lista: Parametro[] = [];
  for (const m of corpo.matchAll(PADRAO)) {
    const chave = normalizar(m[1]!);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const auto = AUTOMATICAS[chave];
    lista.push({
      chave,
      rotulo: auto ? auto.rotulo : rotuloDe(m[1]!),
      origem: auto ? auto.origem : "livre",
    });
  }
  return lista;
}

export interface FontesAutomaticas {
  /** Nome do contato da conversa, como está no cadastro. */
  contato?: { nome?: string | null } | null;
  /** Nome de quem está logado. */
  atendente?: { nome?: string | null } | null;
}

/**
 * Os valores que chegam sozinhos. Chave sem valor NÃO entra no mapa — é isso
 * que faz `precisaDeJanela` perguntar o nome quando o contato não tem um, em
 * vez de mandar "Olá {{nome}}" para o cliente.
 */
export function valoresAutomaticos(fontes: FontesAutomaticas): Record<ChaveDeParametro, string> {
  const valores: Record<ChaveDeParametro, string> = {};
  const nome = (fontes.contato?.nome ?? "").trim();
  if (nome !== "") {
    valores.nome = nome;
    valores.nome_cliente = nome;
    valores.cliente = nome;
    const primeiro = nome.split(/\s+/)[0] ?? "";
    if (primeiro !== "") valores.primeiro_nome = primeiro;
  }
  const atendente = (fontes.atendente?.nome ?? "").trim();
  if (atendente !== "") valores.atendente = atendente;
  return valores;
}

/**
 * Substitui o que tem valor. O que não tem fica LITERAL — nunca vira texto
 * quebrado nem some: um `{{numero_pedido}}` sobrando no campo do composer é
 * visível, e a pessoa vê antes de enviar. É a mesma regra da versão antiga.
 */
export function preencher(corpo: string, valores: Record<ChaveDeParametro, string>): string {
  return corpo.replace(PADRAO, (literal, bruta: string) => {
    const valor = valores[normalizar(bruta)];
    return valor !== undefined && valor.trim() !== "" ? valor : literal;
  });
}

/**
 * A janelinha abre quando SOBRA algo para a pessoa decidir: um parâmetro livre,
 * ou um automático que não tem de onde vir (contato sem nome). Mensagem sem
 * parâmetro, ou com todos resolvidos, entra direto no composer, como sempre.
 */
export function precisaDeJanela(
  parametros: Parametro[],
  valores: Record<ChaveDeParametro, string>,
): boolean {
  return parametros.some((p) => (valores[p.chave] ?? "").trim() === "");
}
