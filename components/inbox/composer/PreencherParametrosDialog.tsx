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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import {
  extrairParametros,
  precisaDeJanela,
  preencher,
  type ChaveDeParametro,
} from "@/lib/inbox/parametros-de-mensagem";

interface Props {
  /** A mensagem escolhida. `null` = fechado. */
  template: MessageTemplate | null;
  /** O que já chegou preenchido (contato, atendente). Editável. */
  valoresIniciais: Record<ChaveDeParametro, string>;
  /** O texto final, pronto para o composer. */
  onUsar: (texto: string) => void;
  onCancelar: () => void;
}

/**
 * A JANELINHA: um campo por parâmetro, na ordem do texto, e a prévia embaixo.
 *
 * Abre só quando sobra algo para decidir (ver `precisaDeJanela`). Os
 * automáticos chegam preenchidos e ficam editáveis — o nome do cadastro pode
 * estar errado, e é aqui que se corrige antes de sair.
 *
 * "Usar mensagem" NÃO envia: põe o texto no composer, e o envio é o botão de
 * sempre. É de propósito — isto chega no celular de um cliente, e a prévia
 * dentro do diálogo é boa, mas a última olhada é no campo de onde a mensagem
 * sai. Um clique a mais, uma mensagem errada a menos.
 */
export function PreencherParametrosDialog({ template, valoresIniciais, onUsar, onCancelar }: Props) {
  if (!template) return null;
  // `key` pela MENSAGEM: trocar de mensagem remonta o formulário do zero, e a
  // próxima não herda o número do pedido da anterior. É o jeito de reiniciar
  // estado sem um efeito que chama setState (o lint reprova, com razão).
  return (
    <Formulario
      key={template.id}
      template={template}
      valoresIniciais={valoresIniciais}
      onUsar={onUsar}
      onCancelar={onCancelar}
    />
  );
}

function Formulario({
  template,
  valoresIniciais,
  onUsar,
  onCancelar,
}: Omit<Props, "template"> & { template: MessageTemplate }) {
  const t = useT();
  const [parametros] = useState(() => extrairParametros(template.body));
  const [valores, setValores] = useState<Record<ChaveDeParametro, string>>(() => ({ ...valoresIniciais }));

  const texto = preencher(template.body, valores);
  const faltam = precisaDeJanela(parametros, valores);
  // O foco nasce no primeiro campo VAZIO: é o que a pessoa veio preencher.
  const primeiroVazio = parametros.findIndex((p) => (valoresIniciais[p.chave] ?? "").trim() === "");

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onCancelar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template.title}</DialogTitle>
          <DialogDescription>
            {t("Preencha o que falta. Os campos já preenchidos vieram do cadastro e podem ser corrigidos.")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!faltam) onUsar(texto);
          }}
        >
          <div className="space-y-3">
            {parametros.map((p, i) => {
              const id = `param-${p.chave}`;
              const valor = valores[p.chave] ?? "";
              return (
                <div key={p.chave} className="space-y-1.5">
                  <Label htmlFor={id} className="flex items-center gap-2">
                    {t(p.rotulo)}
                    {p.origem !== "livre" && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {t("automático")}
                      </span>
                    )}
                  </Label>
                  <Input
                    id={id}
                    value={valor}
                    autoFocus={i === primeiroVazio}
                    onChange={(e) => setValores((v) => ({ ...v, [p.chave]: e.target.value }))}
                    required={valor.trim() === ""}
                    data-parametro={p.chave}
                  />
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("Como vai sair")}
            </div>
            <div
              data-testid="previa-da-mensagem"
              className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-sm"
            >
              {texto}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancelar}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={faltam}>
              {t("Usar mensagem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
