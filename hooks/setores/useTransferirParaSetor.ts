"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { Conversation } from "@/lib/types/messaging";

interface Args {
  conversation_id: string;
  /** `null` tira a conversa de qualquer setor. */
  sector_id: string | null;
}

/**
 * POST /api/v1/conversations/[id]/sector — a conversa vai para a fila do setor
 * (o responsável de antes sai) e o evento entra no fio. Invalida a lista e a
 * conversa: quem transferiu para um setor que não é o dele pode deixar de vê-la
 * no instante seguinte, e a lista precisa refletir isso sem F5.
 */
export function useTransferirParaSetor() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: Args) =>
      apiClient.post<{ data: Conversation }>(`/api/v1/conversations/${args.conversation_id}/sector`, {
        sector_id: args.sector_id,
      }),
    onError: (err, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      showApiError(err);
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["assignment-events", args.conversation_id] });
      toast.success(args.sector_id ? t("Conversa transferida para o setor.") : t("Conversa tirada do setor."));
    },
  });
}
