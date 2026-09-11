"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { CorDeMarcador } from "@/lib/schemas/settings";

export interface Setor {
  id: string;
  organization_id: string;
  name: string;
  color: CorDeMarcador;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member_user_ids: string[];
}

export const SETORES_KEY = ["setores"] as const;

/**
 * Os setores ATIVOS da organização, com os membros de cada um. Um pedido para
 * todo lugar que precisa deles (filtro do inbox, chip na lista, cabeçalho da
 * conversa, tela de setores) — o cache do react-query é o que evita quatro
 * chamadas por tela.
 */
export function useSetores(opts?: { enabled?: boolean; incluirArquivados?: boolean }) {
  const arquivados = opts?.incluirArquivados ?? false;
  return useQuery({
    queryKey: [...SETORES_KEY, arquivados ? "com-arquivados" : "ativos"],
    queryFn: async () =>
      apiClient.get<{ data: Setor[] }>(`/api/v1/sectors${arquivados ? "?archived=true" : ""}`),
    staleTime: 60_000,
    select: (res) => res.data,
    enabled: opts?.enabled ?? true,
  });
}

/** `Map` id → setor, para quem só tem o `sector_id` na mão (a lista, o fio). */
export function useMapaDeSetores(): Map<string, Setor> {
  const { data } = useSetores({ incluirArquivados: true });
  return new Map((data ?? []).map((s) => [s.id, s]));
}
