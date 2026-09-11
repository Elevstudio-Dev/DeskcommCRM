"use client";
import { useMapaDeSetores } from "@/hooks/setores/useSetores";
import { CLASSE_DE_COR } from "@/lib/marcadores/cores";
import { cn } from "@/lib/utils";

interface Props {
  sectorId: string | null | undefined;
  /** Compacto: só o ponto e o nome, em 10px — para a linha da lista. */
  compacto?: boolean;
  className?: string;
}

/**
 * O setor da conversa, na cor dele. Some quando não há setor: "sem setor" não
 * é informação para quem olha uma lista — é a ausência dela.
 *
 * Lê o mapa de setores do cache (um pedido por tela, ver `useSetores`), então
 * pode aparecer em cada linha da lista sem custar uma chamada por linha.
 */
export function ChipDeSetor({ sectorId, compacto, className }: Props) {
  const mapa = useMapaDeSetores();
  if (!sectorId) return null;
  const setor = mapa.get(sectorId);
  if (!setor) return null;
  const cor = CLASSE_DE_COR[setor.color] ?? CLASSE_DE_COR.cinza;
  return (
    <span
      data-testid="chip-de-setor"
      title={setor.archived_at ? `${setor.name} (arquivado)` : setor.name}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium",
        cor.fundo,
        cor.texto,
        compacto ? "h-4 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", cor.ponto)} aria-hidden />
      <span className="truncate">{setor.name}</span>
    </span>
  );
}
