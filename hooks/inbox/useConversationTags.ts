"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Conversation } from "@/lib/types/messaging";
import type { MarcadorDeConversa } from "@/lib/schemas/settings";

interface UpdateTagsArgs {
  conversation_id: string;
  tags: string[];
}

/** G3-05: aplica/remove tags de uma conversa via PATCH; refaz o inbox. */
export function useUpdateConversationTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdateTagsArgs) =>
      apiClient.patch<{ data: Conversation }>(
        `/api/v1/conversations/${args.conversation_id}`,
        { tags: args.tags },
      ),
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      showApiError(err);
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
    },
  });
}

/**
 * G3-05: vocabulário canônico de tags de conversa da org (sugestões).
 * Via server route — o cookie de sessão é HttpOnly, então o browser-supabase
 * não autentica; a leitura org-scoped passa pelo servidor.
 */
export function useConversationTagVocabulary(orgId: string | null) {
  return useQuery({
    queryKey: ["conversation-tag-vocabulary", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    /**
     * Devolve `{ nome, cor }[]` desde 2026-09-05.
     *
     * A ROTA normaliza a forma antiga (`string[]`, gravada por toda instalação
     * anterior a esta) — ver `canonicalConversationTagsSchema`. Aqui o tipo é
     * só o que chega; quem só precisa dos nomes usa `.map((m) => m.nome)`.
     */
    queryFn: async (): Promise<MarcadorDeConversa[]> => {
      const res = await apiClient.get<{ data: MarcadorDeConversa[] }>(
        "/api/v1/conversation-tags",
      );
      return res.data;
    },
  });
}
