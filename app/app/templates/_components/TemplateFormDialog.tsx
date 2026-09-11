"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { CHAVES_AUTOMATICAS, extrairParametros } from "@/lib/inbox/parametros-de-mensagem";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}

interface CreateInput {
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
}

interface UpdateInput {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

export function TemplateFormDialog({ open, onOpenChange, canShare, template }: Props) {
  const t = useT();
  const isEdit = !!template;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [novoParametro, setNovoParametro] = React.useState("");
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  // O que a mensagem pede, lido do texto enquanto se escreve — é a mesma
  // função que o composer usa para decidir se abre a janelinha, então o que
  // aparece aqui é exatamente o que vai ser perguntado lá.
  const parametros = extrairParametros(body);

  /**
   * Insere `{{chave}}` onde o cursor está, e devolve o foco ao texto. Sem isto
   * a pessoa teria de digitar as chaves duplas à mão — e "{ {nome} }" com
   * espaço no meio não é parâmetro, é texto.
   */
  function inserirParametro(chaveBruta: string) {
    const chave = chaveBruta.trim().replace(/\s+/g, "_").toLowerCase();
    if (chave === "") return;
    const marcador = `{{${chave}}}`;
    const ta = bodyRef.current;
    const inicio = ta?.selectionStart ?? body.length;
    const fim = ta?.selectionEnd ?? body.length;
    const proximo = body.slice(0, inicio) + marcador + body.slice(fim);
    setBody(proximo);
    setNovoParametro("");
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = inicio + marcador.length;
    });
  }

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: CreateInput) =>
      apiClient.post<{ data: MessageTemplate }>("/api/v1/message-templates", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) =>
      apiClient.patch<{ data: MessageTemplate }>(`/api/v1/message-templates/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setBody(template?.body ?? "");
    setShortcut(template?.shortcut ?? "");
    setShared(template ? template.owner_user_id === null : false);
    setNovoParametro("");
  }, [open, template]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: template.id,
          title,
          body,
          shortcut: shortcut.trim() || null,
        });
        toast.success(t("Template atualizado."));
      } else {
        await create.mutateAsync({
          title,
          body,
          shortcut: shortcut.trim() || undefined,
          shared: canShare ? shared : false,
        });
        toast.success(t("Template criado."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar template") : t("Novo template")}</DialogTitle>
          <DialogDescription>
            {t("Scripts salvos para responder mais rápido no atendimento.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t("Título")}</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Saudação inicial")}
              minLength={1}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">{t("Mensagem")}</Label>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("Oi {{primeiro_nome}}, aqui é {{atendente}}. Seu pedido {{numero_pedido}} saiu!")}
              minLength={1}
              maxLength={4096}
              required
              rows={5}
            />
            {/*
              PARÂMETROS. Os três automáticos chegam preenchidos na hora de
              usar; qualquer outro vira um campo para a pessoa preencher. Os
              chips inserem no cursor; o campo ao lado cria um novo.
            */}
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("Parâmetros automáticos (chegam preenchidos):")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHAVES_AUTOMATICAS.map(({ chave, rotulo }) => (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => inserirParametro(chave)}
                    title={t(rotulo)}
                    className="rounded-full border bg-background px-2.5 py-0.5 font-mono text-xs transition-colors hover:border-border-strong"
                  >
                    {`{{${chave}}}`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("Novo parâmetro")}
                  value={novoParametro}
                  onChange={(e) => setNovoParametro(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      inserirParametro(novoParametro);
                    }
                  }}
                  placeholder={t("novo parâmetro, ex.: numero_pedido")}
                  maxLength={40}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={novoParametro.trim() === ""}
                  onClick={() => inserirParametro(novoParametro)}
                >
                  {t("Inserir")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Qualquer outro parâmetro vira um campo para preencher na hora de usar.")}
              </p>
            </div>
            {parametros.length > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="esta-mensagem-pede">
                {t("Esta mensagem pede:")}{" "}
                {parametros.map((p, i) => (
                  <span key={p.chave}>
                    {i > 0 && " · "}
                    <span className="text-foreground">{t(p.rotulo)}</span>
                    {p.origem !== "livre" && ` (${t("automático")})`}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">{t("Atalho (opcional)")}</Label>
            <Input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="oi"
              maxLength={40}
            />
          </div>
          {canShare && (
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-shared"
                checked={shared}
                onCheckedChange={setShared}
                disabled={isEdit}
              />
              <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? t("Salvar") : t("Criar template")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
