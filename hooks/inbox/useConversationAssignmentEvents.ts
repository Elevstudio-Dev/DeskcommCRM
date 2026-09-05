"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

/**
 * Quem assumiu, largou ou transferiu esta conversa.
 *
 * Poucas linhas por conversa (uma por troca de dono), então query simples, sem
 * paginação — o mesmo desenho das notas internas.
 *
 * O REALTIME importa mais aqui do que nas notas, e por um motivo específico: o
 * caso que este recurso resolve é DUAS pessoas com a mesma conversa aberta. Sem
 * a assinatura, quem já estava com a tela aberta continuaria vendo a conversa
 * como livre depois de o colega assumir — exatamente a colisão que o aviso
 * existe para evitar.
 */
export interface AssignmentEvent {
  id: string;
  /** `claim` | `transfer` | `release` | `routing` | `handoff` (constraint da tabela). */
  reason: string;
  created_at: string;
  to_user_id: string | null;
  from_user_id: string | null;
  changed_by: string | null;
  /** `null` = não foi possível resolver (sem service role) — NUNCA "sem responsável". */
  to_user_name: string | null;
  from_user_name: string | null;
  changed_by_name: string | null;
}

export function useConversationAssignmentEvents(conversationId: string | null) {
  const qc = useQueryClient();
  const queryKey = ["assignment-events", conversationId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!conversationId,
    queryFn: async () => {
      try {
        return await apiClient.get<{ data: AssignmentEvent[] }>(
          `/api/v1/conversations/${conversationId}/assignment-events`,
        );
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    select: (res) => res.data,
  });

  const onChange = useCallback(() => {
    if (conversationId) qc.invalidateQueries({ queryKey: ["assignment-events", conversationId] });
  }, [qc, conversationId]);

  useRealtimeChannel({
    name: conversationId
      ? `conversation-assignment-${conversationId}`
      : "conversation-assignment-disabled",
    postgresChanges: conversationId
      ? {
          event: "INSERT",
          schema: "public",
          table: "conversation_assignment_events",
          filter: `conversation_id=eq.${conversationId}`,
        }
      : undefined,
    onChange,
    enabled: !!conversationId,
  });

  return query.data ?? [];
}
