"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useSetores } from "@/hooks/setores/useSetores";
import { useTransferirParaSetor } from "@/hooks/setores/useTransferirParaSetor";
import { CLASSE_DE_COR } from "@/lib/marcadores/cores";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
  setorAtualId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const SEM_SETOR = "__sem__";

/**
 * Transferir a conversa para um SETOR — e não para uma pessoa.
 *
 * A conversa vai para a fila do setor: quem era responsável sai (pode nem ser
 * do setor novo), e o rodízio do setor — se ligado — escolhe alguém. É o
 * gesto do WhatsApp da loja: "isso é com o financeiro".
 */
export function TransferirParaSetorDialog({ conversationId, setorAtualId, open, onOpenChange }: Props) {
  const t = useT();
  const setores = useSetores({ enabled: open });
  const transferir = useTransferirParaSetor();
  const [alvo, setAlvo] = useState<string>("");

  const opcoes = (setores.data ?? []).filter((s) => s.id !== setorAtualId);

  function fechar(v: boolean) {
    if (!v) setAlvo("");
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Transferir para um setor")}</DialogTitle>
          <DialogDescription>
            {t(
              "A conversa vai para a fila do setor escolhido. Quem é o responsável hoje deixa de ser, e a mudança fica registrada no histórico.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="setor-alvo">{t("Setor")}</Label>
          <Select value={alvo} onValueChange={setAlvo}>
            <SelectTrigger id="setor-alvo" className="w-full">
              <SelectValue placeholder={setores.isLoading ? t("Carregando…") : t("Escolha o setor")} />
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", CLASSE_DE_COR[s.color]?.ponto)} aria-hidden />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
              {setorAtualId && <SelectItem value={SEM_SETOR}>{t("Nenhum setor (tirar do setor)")}</SelectItem>}
            </SelectContent>
          </Select>
          {!setores.isLoading && opcoes.length === 0 && !setorAtualId && (
            <p className="text-xs text-muted-foreground">{t("Nenhum setor cadastrado. Crie em Configurações → Setores.")}</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => fechar(false)}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            disabled={!alvo || transferir.isPending}
            onClick={() =>
              transferir.mutate(
                { conversation_id: conversationId, sector_id: alvo === SEM_SETOR ? null : alvo },
                { onSuccess: () => fechar(false) },
              )
            }
          >
            {transferir.isPending ? t("Transferindo…") : t("Transferir")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
