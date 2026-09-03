/**
 * Ha quanto tempo o cliente espera resposta — ou `null` quando nao ha espera.
 *
 * A METRICA, escolhida pelo dono do produto: tempo desde a ultima mensagem do
 * CLIENTE. Nao e "tempo desde a ultima mensagem" nem "idade da conversa". A
 * diferenca aparece no terceiro caso de `null` abaixo, e e ela que faz o
 * contador significar "a bola esta com a gente".
 *
 * Funcao pura, com `agora` injetado. Relogio real dentro da regra e o que faz
 * um teste passar 23h por dia e reprovar na vigesima quarta — este repo ja tem
 * esse defeito medido em outro lugar (o invariante que reprova PR alheio
 * quando o relogio do runner bate 14:30 UTC).
 */

/** Verde ate um terco do limite, amarelo ate o limite, vermelho depois. */
export type Faixa = "ok" | "atencao" | "estourado";

/**
 * O limite quando a organizacao nao configurou nenhum.
 *
 * Nao e um palpite disfarcado de padrao: enquanto ninguem escolher, TODA
 * organizacao usa este numero, e a tela diz qual e. Um produto que quebra
 * porque ninguem preencheu SLA e pior que um que assume 15 e conta.
 */
export const PISO_MINUTOS = 15;

export interface EntradaDoTempo {
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  status: string;
  agora: Date;
  /** `organizations.settings.sla.primeira_resposta_minutos`. 0 ou ausente cai no piso. */
  limiteMinutos: number;
}

export interface TempoSemResposta {
  minutos: number;
  faixa: Faixa;
  /** Pronto para a tela: "3 min", "1h 20", "2 d". */
  rotulo: string;
}

/** Conversa encerrada nao espera ninguem. */
const ENCERRADAS = new Set(["closed", "archived"]);

function rotuloDe(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 60 * 24) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}`;
  }
  return `${Math.floor(minutos / (60 * 24))} d`;
}

function faixaDe(minutos: number, limite: number): Faixa {
  if (minutos <= limite / 3) return "ok";
  // `<=` e nao `<`: exatamente no limite ainda e atencao. Estourar e passar,
  // nao chegar.
  if (minutos <= limite) return "atencao";
  return "estourado";
}

export function tempoSemResposta(e: EntradaDoTempo): TempoSemResposta | null {
  // (1) Conversa encerrada: ninguem esta esperando.
  if (ENCERRADAS.has(e.status)) return null;

  // (2) O cliente nunca escreveu: nao ha espera para contar.
  if (!e.lastInboundAt) return null;

  const entrada = new Date(e.lastInboundAt).getTime();
  if (Number.isNaN(entrada)) return null;

  // (3) O atendente ja respondeu DEPOIS: a bola esta com o cliente.
  if (e.lastOutboundAt) {
    const saida = new Date(e.lastOutboundAt).getTime();
    if (!Number.isNaN(saida) && saida >= entrada) return null;
  }

  const minutos = Math.floor((e.agora.getTime() - entrada) / 60_000);
  if (minutos < 0) return null;

  const limite = e.limiteMinutos > 0 ? e.limiteMinutos : PISO_MINUTOS;

  return { minutos, faixa: faixaDe(minutos, limite), rotulo: rotuloDe(minutos) };
}
