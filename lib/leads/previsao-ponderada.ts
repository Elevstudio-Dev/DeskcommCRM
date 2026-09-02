import type { LeadStatus } from "@/lib/types/leads";

/**
 * Previsão ponderada — quanto o funil vale depois de descontar a incerteza.
 *
 * Função pura: recebe os negócios, não os busca. É o mesmo motivo de
 * `lib/branding.ts` — assim o mesmo cálculo serve servidor, tela e teste, e o
 * teste não precisa de banco.
 *
 * ── A decisão que importa: ausência não é zero ───────────────────────────────
 *
 * Negócio sem aposta do vendedor (`commit_probability_pct === null`) **fica de
 * fora do total** e volta contado em `semAposta`. A alternativa — tratar null
 * como 0% — somaria silenciosamente, e o gerente leria como "o funil vale isso"
 * um número que na verdade diz "ninguém estimou metade dele". Deixar de fora e
 * MOSTRAR quantos ficaram é o modo de errar que a tela consegue confessar.
 *
 * Pelo mesmo motivo 0% é diferente de null e ENTRA na conta: quem digitou zero
 * opinou, e a opinião dele é que este negócio não fecha.
 */
export interface NegocioParaPrevisao {
  value_cents: number | null;
  commit_probability_pct: number | null;
  status: LeadStatus;
}

export interface PrevisaoPonderada {
  /** Valor × probabilidade somado, em centavos. */
  ponderadoCents: number;
  /** Soma crua APENAS dos negócios que entraram — não do funil inteiro. */
  brutoCents: number;
  /** Quantos negócios abertos entraram na conta. */
  considerados: number;
  /** Abertos com valor, mas sem aposta. Nunca somados como zero. */
  semAposta: number;
  /** Abertos com aposta, mas sem valor. Não dá para ponderar o que não tem preço. */
  semValor: number;
}

/**
 * Só negócio ABERTO entra: `won`/`lost` já aconteceram, e previsão que soma o
 * que já fechou vira relatório de vendas disfarçado de projeção.
 *
 * O arredondamento é POR NEGÓCIO, não no total. É o que faz a coluna da tela
 * fechar com o rodapé — arredondar só no fim deixa a soma das linhas exibidas
 * divergindo do total por alguns centavos, e alguém vai abrir chamado.
 */
export function previsaoPonderada(
  negocios: readonly NegocioParaPrevisao[],
): PrevisaoPonderada {
  let ponderadoCents = 0;
  let brutoCents = 0;
  let considerados = 0;
  let semAposta = 0;
  let semValor = 0;

  for (const n of negocios) {
    if (n.status !== "open") continue;

    const temValor = n.value_cents !== null;
    const temAposta = n.commit_probability_pct !== null;

    if (!temValor && !temAposta) continue;
    if (!temValor) {
      semValor += 1;
      continue;
    }
    if (!temAposta) {
      semAposta += 1;
      continue;
    }

    considerados += 1;
    brutoCents += n.value_cents!;
    ponderadoCents += Math.round((n.value_cents! * n.commit_probability_pct!) / 100);
  }

  return { ponderadoCents, brutoCents, considerados, semAposta, semValor };
}
