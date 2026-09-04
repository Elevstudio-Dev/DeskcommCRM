"use client";

import { useQuery } from "@tanstack/react-query";

import { PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

/**
 * Em quantos minutos a primeira resposta vira alarme, nesta organizacao.
 *
 * Vive em `organizations.settings.sla.primeira_resposta_minutos` — o `jsonb`
 * que ja carrega `llm`, `routing`, `branding` e `visibility_mode`. Sem coluna
 * nova, sem migration: o padrao de configuracao por organizacao ja existe e e
 * este.
 *
 * FALHA ABERTA, de proposito. Erro de rede, resposta inesperada, chave ausente:
 * tudo cai no piso. Um cabecalho que perde o contador porque a leitura de
 * configuracao falhou troca informacao util por nenhuma — e o operador nao
 * teria como saber que faltou algo.
 *
 * DOIS pisos, e nao e redundancia boba: o do servidor cobre "ninguem
 * configurou", o daqui cobre "nao consegui perguntar". Sao falhas diferentes e
 * nenhuma delas deve apagar o contador.
 *
 * `staleTime` de 5 minutos porque limite de SLA nao muda no meio do
 * atendimento: revalidar a cada foco de janela seria pedir ao servidor um
 * numero que ninguem trocou.
 */
export function useLimiteDeResposta(): number {
  const { data } = useQuery({
    queryKey: ["org-settings", "sla"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/sla");
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: { primeira_resposta_minutos?: unknown } };
      const bruto = j.data?.primeira_resposta_minutos;
      return typeof bruto === "number" && bruto > 0 ? bruto : null;
    },
    staleTime: 5 * 60_000,
  });

  return data ?? PISO_MINUTOS;
}
