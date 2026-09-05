"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { CLASSE_DE_COR, NOME_DA_COR } from "@/lib/marcadores/cores";
import {
  CORES_DE_MARCADOR,
  COR_DE_MARCADOR_PADRAO,
  type CorDeMarcador,
  type MarcadorDeConversa,
} from "@/lib/schemas/settings";
import { Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface MarcadorEmUso {
  marcador: string;
  conversas: number;
  oficial: boolean;
}

/**
 * A TELA QUE FALTAVA.
 *
 * `lib/operacao/marcadores-e-time.ts` registrava a lacuna em letras maiúsculas:
 * o vocabulário de marcadores tinha rota de leitura e **nenhuma tela para ver ou
 * mudar**. Quem quisesse padronizar "urgente" na operação precisava de acesso ao
 * Postgres.
 *
 * A tela junta as DUAS respostas de propósito, porque separadas elas enganam:
 *
 *  - o vocabulário oficial sozinho esconde o que a operação inventou e usa todo
 *    dia — e é justamente aí que "urgente", "urgent" e "URGENTE" convivem;
 *  - a contagem sozinha esconde o marcador que a empresa declarou e ninguém
 *    aplicou, que é o que o manager precisa ver para saber que a régua dele não
 *    pegou.
 *
 * Por isso a lista mostra os dois, marcados, com a contagem ao lado.
 */
export function MarcadoresClient({ inicial }: { inicial: MarcadorDeConversa[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [marcadores, setMarcadores] = useState<MarcadorDeConversa[]>(inicial);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<CorDeMarcador>(COR_DE_MARCADOR_PADRAO);

  // O servidor é a verdade quando a página recarrega ou quando outra aba salva.
  useEffect(() => setMarcadores(inicial), [inicial]);

  const { data: uso } = useQuery({
    queryKey: ["conversation-tags-uso"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: MarcadorEmUso[] }>("/api/v1/conversation-tags/uso");
      return r.data;
    },
  });

  const salvar = useMutation({
    mutationFn: async (lista: MarcadorDeConversa[]) =>
      apiClient.put<{ data: MarcadorDeConversa[] }>("/api/v1/conversation-tags", { tags: lista }),
    onSuccess: async (r) => {
      setMarcadores(r.data);
      toast.success(t("Marcadores salvos"));
      // O inbox lê o vocabulário com `staleTime` de 5 minutos: sem invalidar,
      // quem salvasse aqui e voltasse para a conversa veria a lista antiga e
      // concluiria que não salvou.
      await qc.invalidateQueries({ queryKey: ["conversation-tag-vocabulary"] });
      await qc.invalidateQueries({ queryKey: ["conversation-tags-uso"] });
    },
    onError: (err) => showApiError(err),
  });

  function acrescentar() {
    const limpo = nome.trim().toLowerCase().slice(0, 40);
    if (!limpo) return;
    if (marcadores.some((m) => m.nome === limpo)) {
      toast.info(t("Esse marcador já existe."));
      return;
    }
    if (marcadores.length >= 50) {
      toast.warning(t("O limite é de 50 marcadores."));
      return;
    }
    salvar.mutate([...marcadores, { nome: limpo, cor }]);
    setNome("");
  }

  function trocarCor(alvo: string, nova: CorDeMarcador) {
    salvar.mutate(marcadores.map((m) => (m.nome === alvo ? { ...m, cor: nova } : m)));
  }

  function remover(alvo: string) {
    salvar.mutate(marcadores.filter((m) => m.nome !== alvo));
  }

  const contagemDe = (nomeDoMarcador: string) =>
    uso?.find((u) => u.marcador === nomeDoMarcador)?.conversas;
  // Marcador que existe nas conversas e NÃO no vocabulário. É o achado que faz
  // esta tela valer: são as variações que ninguém declarou e que quebram o
  // filtro e a contagem sem aparecer em lugar nenhum.
  const naoOficiais = (uso ?? []).filter((u) => !u.oficial && u.conversas > 0);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("Marcadores da empresa")}</h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Servem para filtrar conversas e para medir. Quem atende aplica; só manager cria.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grow space-y-1">
            <Label htmlFor="novo-marcador" className="text-xs">
              {t("Nome")}
            </Label>
            <Input
              id="novo-marcador"
              value={nome}
              maxLength={40}
              placeholder={t("ex.: urgente")}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  acrescentar();
                }
              }}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("Cor")}</Label>
            <Select value={cor} onValueChange={(v) => setCor(v as CorDeMarcador)}>
              <SelectTrigger className="h-8 w-40" aria-label={t("Cor do marcador")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CORES_DE_MARCADOR.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", CLASSE_DE_COR[c].ponto)} aria-hidden />
                      {t(NOME_DA_COR[c])}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-8"
            onClick={acrescentar}
            disabled={salvar.isPending || !nome.trim()}
            data-testid="criar-marcador"
          >
            <Plus size={14} weight="bold" aria-hidden />
            {t("Criar")}
          </Button>
        </div>

        {marcadores.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t("Nenhum marcador ainda. Crie o primeiro acima.")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {marcadores.map((m) => (
              <li key={m.nome} className="flex items-center gap-3 px-3 py-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    CLASSE_DE_COR[m.cor].fundo,
                    CLASSE_DE_COR[m.cor].texto,
                  )}
                >
                  {m.nome}
                </span>
                <span className="grow text-xs tabular-nums text-muted-foreground">
                  {/*
                    `undefined` (ainda carregando) e `0` são coisas diferentes, e
                    mostrar "0 conversas" enquanto a contagem não chegou faria o
                    manager concluir que o marcador dele não pegou.
                  */}
                  {contagemDe(m.nome) === undefined
                    ? "—"
                    : `${contagemDe(m.nome)} ${t("conversas")}`}
                </span>
                <Select value={m.cor} onValueChange={(v) => trocarCor(m.nome, v as CorDeMarcador)}>
                  <SelectTrigger
                    className="h-7 w-32"
                    aria-label={`${t("Cor de")} ${m.nome}`}
                    disabled={salvar.isPending}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CORES_DE_MARCADOR.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn("size-2 rounded-full", CLASSE_DE_COR[c].ponto)}
                            aria-hidden
                          />
                          {t(NOME_DA_COR[c])}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => remover(m.nome)}
                  disabled={salvar.isPending}
                  aria-label={`${t("Remover")} ${m.nome}`}
                  className="rounded-sm p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash size={14} weight="bold" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {naoOficiais.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold">{t("Em uso, mas fora da lista")}</h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "Alguém digitou estes na conversa. Eles funcionam, mas não aparecem no filtro — e cada variação de um mesmo assunto divide a contagem.",
              )}
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {naoOficiais.map((u) => (
              <li key={u.marcador}>
                <button
                  type="button"
                  disabled={salvar.isPending || marcadores.length >= 50}
                  onClick={() =>
                    salvar.mutate([
                      ...marcadores,
                      { nome: u.marcador, cor: COR_DE_MARCADOR_PADRAO },
                    ])
                  }
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-solid hover:text-foreground disabled:opacity-50"
                >
                  <Plus size={11} weight="bold" aria-hidden />
                  {u.marcador}
                  <span className="tabular-nums opacity-70">({u.conversas})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
