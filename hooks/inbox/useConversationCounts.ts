"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface ConversationCounts {
  /**
   * OPCIONAIS de propósito: um cache de react-query gravado antes deste deploy
   * não tem estes campos, e a tela lê o cache antes da primeira resposta nova.
   * Marcá-los obrigatórios daria `undefined` onde o tipo promete `number` — e o
   * badge imprimiria "NaN" no primeiro segundo depois de atualizar.
   */
  fila?: number;
  automatico?: number;
  /** Nome antigo de `fila`, mantido pela rota versionada. Prefira `fila`. */
  unassigned: number;
  mine: number;
  all: number;
  /**
   * Opcional pelo mesmo motivo que `fila` e `automatico` são: a página pode
   * estar lendo um cache de react-query gravado ANTES do deploy que criou o
   * campo. Sem o `?`, o badge da visão Grupos apareceria como `undefined` por
   * alguns segundos em vez de simplesmente não aparecer.
   */
  grupos?: number;
}

/**
 * Contagens por visão do inbox (G4-02). O endpoint usa o client RLS-scoped —
 * um agent em modo own* recebe a contagem do seu escopo, não o total da org.
 */
export function useConversationCounts(orgId: string | null) {
  return useQuery({
    queryKey: ["conversation-counts", orgId],
    enabled: !!orgId,
    refetchInterval: 30_000,
    queryFn: () =>
      apiClient
        .get<{ data: ConversationCounts }>("/api/v1/conversations/counts")
        .then((r) => r.data),
  });
}
