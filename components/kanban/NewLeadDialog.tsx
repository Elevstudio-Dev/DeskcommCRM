"use client";

import { useT } from "@/hooks/i18n/useT";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateLead } from "@/hooks/kanban/useCreateLead";
import type { Stage } from "@/lib/kanban/types";
import { createLeadSchema, type CreateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { EcoDoValor } from "./EcoDoValor";

interface FormShape {
  title: string;
  description: string;
  stage_id: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId: string;
  stages: Stage[];
  /** Vincula o lead criado a este contato de origem (ex.: painel do Inbox). */
  contactId?: string | null;
  /**
   * Os negócios ABERTOS que este contato já tem.
   *
   * Só chega preenchido de onde o contato é conhecido — o painel do Inbox. Da
   * página do funil vem vazio, e aí não há o que avisar.
   *
   * POR QUE ISTO EXISTE: `lib/leads/nascimento-do-lead.ts` cria um negócio
   * sozinho quando a primeira mensagem chega, e recusa criar um segundo se já
   * houver aberto. Essa guarda protege só o caminho automático — a criação
   * manual não olhava, e o resultado media-se na tela: o mesmo contato com dois
   * cards no funil, um deles sem valor e sem motivo.
   *
   * Avisa, não bloqueia: duas oportunidades para o mesmo cliente é caso real
   * (o orçamento do site e a manutenção mensal), e recusar seria trocar um
   * engano ocasional por uma parede diária.
   */
  negociosAbertos?: { id: string; title: string }[];
  /** Fecha o diálogo e leva ao negócio que já existe, em vez de criar outro. */
  onUsarExistente?: (leadId: string) => void;
  /** Depois do INSERT — o inbox relê o resumo para o lead novo aparecer no formulário. */
  onCreated?: () => void;
}

function defaultStageId(stages: Stage[]): string {
  const open = stages.find((s) => !s.is_won && !s.is_lost && !s.is_archived);
  return open?.id ?? stages[0]?.id ?? "";
}

export function NewLeadDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
  contactId,
  negociosAbertos,
  onUsarExistente,
  onCreated,
}: Props) {
  const t = useT();
  const create = useCreateLead(pipelineId);
  const initialStage = useMemo(() => defaultStageId(stages), [stages]);

  const form = useForm<FormShape>({
    defaultValues: {
      title: "",
      description: "",
      stage_id: initialStage,
      valueReais: "",
      tagsRaw: "",
      expected_close_date: "",
    },
  });

  // Reset stage_id default if stages change while dialog mounted.
  useEffect(() => {
    if (!form.getValues("stage_id") && initialStage) {
      form.setValue("stage_id", initialStage);
    }
  }, [initialStage, form]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: "Valor inválido" });
        return;
      }
    }

    const payload: Record<string, unknown> = {
      pipeline_id: pipelineId,
      stage_id: values.stage_id,
      title: values.title.trim(),
      currency: "BRL",
      source: "manual",
      tags,
    };
    if (contactId) payload.contact_id = contactId;
    if (values.description.trim()) payload.description = values.description.trim();
    if (valueCents !== null) payload.value_cents = valueCents;
    if (values.expected_close_date) payload.expected_close_date = values.expected_close_date;

    const parsed = createLeadSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos");
      return;
    }

    try {
      await create.mutateAsync(parsed.data as CreateLeadInput);
      toast.success(t("Lead criado"));
      onCreated?.();
      form.reset({
        title: "",
        description: "",
        stage_id: initialStage,
        valueReais: "",
        tagsRaw: "",
        expected_close_date: "",
      });
      onOpenChange(false);
    } catch {
      // toast already shown
    }
  }

  const stageId = form.watch("stage_id");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
          <DialogDescription>
            {t("Crie um lead manualmente neste pipeline.")}
          </DialogDescription>
        </DialogHeader>
        {negociosAbertos && negociosAbertos.length > 0 && (
          <div className="rounded-md border bg-muted/50 p-3 text-sm">
            <p className="font-medium">
              {negociosAbertos.length === 1
                ? t("Este contato já tem um negócio aberto.")
                : `${t("Este contato já tem")} ${negociosAbertos.length} ${t("negócios abertos.")}`}
            </p>
            <ul className="mt-2 space-y-1">
              {negociosAbertos.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{n.title}</span>
                  {onUsarExistente && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onUsarExistente(n.id)}
                    >
                      {t("Usar este")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "O funil abre um negócio sozinho na primeira mensagem, para a pessoa não ficar fora do radar. Criar outro faz sentido quando é uma oportunidade diferente.",
              )}
            </p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("Título")}</Label>
            <Input
              id="title"
              placeholder="Ex: Pedido Maria — combo presente"
              {...form.register("title", { required: true, minLength: 2 })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("Descrição")}</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder={t("Contexto, observações, links…")}
              {...form.register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select
              value={stageId}
              onValueChange={(v) => form.setValue("stage_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages
                  .filter((s) => !s.is_archived)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="valueReais">Valor (R$)</Label>
              <Input
                id="valueReais"
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("valueReais")}
              />
              <EcoDoValor control={form.control} />
              {form.formState.errors.valueReais && (
                <p className="text-xs text-error-fg">
                  {form.formState.errors.valueReais.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_close_date">Fechamento previsto</Label>
              <Input
                id="expected_close_date"
                type="date"
                {...form.register("expected_close_date")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagsRaw">{t("Tags (separadas por vírgula)")}</Label>
            <Input
              id="tagsRaw"
              placeholder="vip, recompra"
              {...form.register("tagsRaw")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !stageId}>
              {create.isPending ? "Criando…" : "Criar lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
