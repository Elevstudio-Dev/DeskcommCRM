"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { escolherCaminho } from "@/app/actions/onboarding/escolherCaminho";
import { useT } from "@/hooks/i18n/useT";
import { Robot, Kanban } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Os dois caminhos, um ao lado do outro.
 *
 * CARTÃO E NÃO LISTA DE RÁDIO: a escolha muda quantas telas vêm pela frente, e
 * um rádio com duas linhas de texto não deixa isso à vista. Cada cartão diz o
 * que a pessoa vai encontrar — não o nome do modo.
 *
 * BOTÃO POR CARTÃO, sem "Continuar" no fim: com um só campo, o passo extra de
 * confirmar não protege de nada e só adiciona um clique.
 */
function Caminho({
  valor,
  titulo,
  descricao,
  passos,
  icone,
  destaque,
  pending,
}: {
  valor: string;
  titulo: string;
  descricao: string;
  passos: string;
  icone: React.ReactNode;
  destaque: boolean;
  pending: boolean;
}) {
  return (
    <button
      type="submit"
      name="caminho"
      value={valor}
      disabled={pending}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-5 text-left transition-colors",
        "hover:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-60",
        destaque ? "border-primary/60 bg-primary/[0.03]" : "bg-background",
      )}
    >
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full",
          destaque ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {icone}
      </span>
      <span className="text-base font-semibold">{titulo}</span>
      <span className="text-sm text-muted-foreground">{descricao}</span>
      {/* Os passos por extenso: é o que responde "quanto tempo isso leva?"
          antes de a pessoa entrar, e não depois de três telas. */}
      <span className="mt-auto pt-2 text-xs text-muted-foreground">{passos}</span>
    </button>
  );
}

export function CaminhoForm() {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={(formData) => {
        startTransition(async () => {
          const res = await escolherCaminho(formData);
          if (res && !res.ok) toast.error(`${t("Falha")}: ${res.error}`);
        });
      }}
    >
      <Caminho
        valor="com_ia"
        destaque
        pending={pending}
        icone={<Robot size={20} weight="duotone" />}
        titulo={t("Com o atendente de IA")}
        descricao={t(
          "Você monta um funcionário que responde os clientes no WhatsApp sozinho. Precisa de uma chave de IA — dá para pegar uma gratuita.",
        )}
        passos={t("Negócio · WhatsApp · Treinar · Funil · Ver ele atender · Equipe")}
      />
      <Caminho
        valor="so_crm"
        destaque={false}
        pending={pending}
        icone={<Kanban size={20} weight="duotone" />}
        titulo={t("Só o CRM, por enquanto")}
        descricao={t(
          "Sua equipe atende pelo sistema, com o funil e o histórico de cada cliente. Você liga a IA quando quiser, em Agentes.",
        )}
        passos={t("Negócio · WhatsApp · Funil · Equipe")}
      />
    </form>
  );
}
