"use client";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock } from "@/lib/ui/icons";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  disabled?: boolean;
}

const DURATIONS: Array<{ hours: 1 | 3 | 24; label: string }> = [
  { hours: 1, label: "Em 1 hora" },
  { hours: 3, label: "Em 3 horas" },
  { hours: 24, label: "Em 24 horas" },
];

function isSnoozeActive(snoozeUntil: string | null): boolean {
  return snoozeUntil != null && new Date(snoozeUntil).getTime() > Date.now();
}

/** O rótulo do lembrete depende de já haver um marcado. */
export function rotuloDeLembrete(snoozeUntil: string | null, t: (s: string) => string): string {
  return isSnoozeActive(snoozeUntil) ? t("Lembrete ativo") : t("Lembrar");
}

/**
 * SÓ OS ITENS, sem gatilho e sem menu em volta.
 *
 * Existe porque o cabeçalho da conversa passou a reunir as ações num menu
 * "Opções", e um `DropdownMenu` inteiro não pode morar dentro de outro. Aqui os
 * itens ficam soltos: o `SnoozeButton` os embrulha no menu dele, e o cabeçalho
 * os embrulha num submenu. Nenhum dos dois copia a lista de durações — copiar
 * seria a lista que envelhece só de um lado.
 */
export function ItensDeLembrete({ conversationId, snoozeUntil }: Omit<Props, "disabled">) {
  const t = useT();
  const { snooze, cancel } = useSnoozeConversation();
  if (isSnoozeActive(snoozeUntil)) {
    return (
      <DropdownMenuItem onClick={() => cancel.mutate({ conversation_id: conversationId })}>
        {t("Cancelar lembrete")}
      </DropdownMenuItem>
    );
  }
  return (
    <>
      {DURATIONS.map((d) => (
        <DropdownMenuItem
          key={d.hours}
          onClick={() => snooze.mutate({ conversation_id: conversationId, duration_hours: d.hours })}
        >
          {t(d.label)}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function SnoozeButton({ conversationId, snoozeUntil, disabled }: Props) {
  const t = useT();
  const { snooze, cancel } = useSnoozeConversation();
  const isPending = snooze.isPending || cancel.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || isPending}
          className="flex items-center gap-1"
        >
          <Clock size={12} weight="regular" aria-hidden />
          {rotuloDeLembrete(snoozeUntil, t)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ItensDeLembrete conversationId={conversationId} snoozeUntil={snoozeUntil} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
