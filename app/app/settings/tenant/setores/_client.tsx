"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { SETORES_KEY, useSetores, type Setor } from "@/hooks/setores/useSetores";
import { useTeamMembers } from "@/hooks/team/useTeamMembers";
import { apiClient } from "@/lib/api/client";
import { CLASSE_DE_COR, NOME_DA_COR } from "@/lib/marcadores/cores";
import { CORES_DE_MARCADOR, type CorDeMarcador } from "@/lib/schemas/settings";
import {
  configuracaoDeSetoresSchema,
  type ConfiguracaoDeSetores,
} from "@/lib/schemas/setores";
import { montarTextoDoMenu, opcoesDoMenu } from "@/lib/setores/menu";
import { PencilSimple, Plus, UsersThree } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const CONFIG_KEY = ["settings", "setores"] as const;

/**
 * A tela de setores: a lista (criar, renomear, recolorir, membros, arquivar) e
 * o bloco do menu de primeiro contato, com a prévia do texto que o cliente vai
 * receber — montada pela MESMA função que a ingestão usa (`montarTextoDoMenu`),
 * então o que se vê aqui é o que sai lá.
 */
export function SetoresClient() {
  const t = useT();
  const qc = useQueryClient();
  const setores = useSetores();
  const membros = useTeamMembers();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [membrosDe, setMembrosDe] = useState<Setor | null>(null);

  const invalidar = () => qc.invalidateQueries({ queryKey: SETORES_KEY });

  const arquivar = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/sectors/${id}`),
    onError: showApiError,
    onSuccess: () => {
      invalidar();
      toast.success(t("Setor arquivado."));
    },
  });

  const nomeDoMembro = (userId: string) => {
    const m = (membros.data?.data ?? []).find((x) => x.user_id === userId);
    return m?.full_name || m?.email || t("Membro");
  };

  const lista = setores.data ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("Os setores")}</h2>
          <Button size="sm" onClick={() => setNovoAberto(true)}>
            <Plus size={14} aria-hidden />
            {t("Novo setor")}
          </Button>
        </div>

        {setores.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
        ) : lista.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("Nenhum setor ainda. Crie o primeiro — Assistência, Financeiro, Recepção — e diga quem atende em cada um.")}
          </div>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {lista.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="setor">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium",
                    CLASSE_DE_COR[s.color]?.fundo,
                    CLASSE_DE_COR[s.color]?.texto,
                  )}
                >
                  <span className={cn("size-2 rounded-full", CLASSE_DE_COR[s.color]?.ponto)} aria-hidden />
                  {s.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {s.member_user_ids.length === 0
                    ? t("Ninguém neste setor ainda")
                    : s.member_user_ids.map(nomeDoMembro).join(", ")}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => setMembrosDe(s)}
                    aria-label={`${t("Membros de")} ${s.name}`}
                  >
                    <UsersThree size={16} aria-hidden />
                    {t("Membros")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditando(s)}
                    aria-label={`${t("Editar")} ${s.name}`}
                  >
                    <PencilSimple size={16} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={arquivar.isPending}
                    onClick={() => {
                      if (confirm(`${t("Arquivar o setor")} ${s.name}?`)) arquivar.mutate(s.id);
                    }}
                  >
                    {t("Arquivar")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MenuDePrimeiroContato setores={lista} />

      {/* Montados só enquanto abertos: o estado do formulário nasce das props
          no mount, e fechar descarta — sem efeito sincronizando estado. */}
      {(novoAberto || editando !== null) && (
        <SetorFormDialog
          setor={editando}
          onClose={() => {
            setNovoAberto(false);
            setEditando(null);
          }}
        />
      )}
      {membrosDe && <MembrosDialog setor={membrosDe} onClose={() => setMembrosDe(null)} />}
    </div>
  );
}

function SetorFormDialog({ setor, onClose }: { setor: Setor | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [nome, setNome] = useState(setor?.name ?? "");
  const [cor, setCor] = useState<CorDeMarcador>(setor?.color ?? "cinza");

  const salvar = useMutation({
    mutationFn: async () =>
      setor
        ? apiClient.patch(`/api/v1/sectors/${setor.id}`, { name: nome.trim(), color: cor })
        : apiClient.post("/api/v1/sectors", { name: nome.trim(), color: cor }),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETORES_KEY });
      toast.success(setor ? t("Setor atualizado.") : t("Setor criado."));
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{setor ? t("Editar setor") : t("Novo setor")}</DialogTitle>
          <DialogDescription>{t("O nome é o que o cliente vê no menu de primeiro contato.")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) salvar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="setor-nome">{t("Nome")}</Label>
            <Input
              id="setor-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Financeiro")}
              maxLength={60}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setor-cor">{t("Cor")}</Label>
            <Select value={cor} onValueChange={(v) => setCor(v as CorDeMarcador)}>
              <SelectTrigger id="setor-cor" className="w-48" aria-label={t("Cor do setor")}>
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={salvar.isPending || !nome.trim()}>
              {setor ? t("Salvar") : t("Criar setor")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MembrosDialog({ setor, onClose }: { setor: Setor; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const membros = useTeamMembers();
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(setor.member_user_ids));

  const salvar = useMutation({
    mutationFn: async () =>
      apiClient.put(`/api/v1/sectors/${setor.id}/members`, { user_ids: [...marcados] }),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETORES_KEY });
      toast.success(t("Membros atualizados."));
      onClose();
    },
  });

  // Só quem ATENDE entra num setor: viewer é leitura, e membership revogada não
  // é membership. Mesmo filtro do seletor de transferência.
  const elegiveis = (membros.data?.data ?? []).filter((m) => m.revoked_at === null && m.role !== "viewer");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("Quem atende em")} {setor.name}
          </DialogTitle>
          <DialogDescription>
            {t("Quem está no setor vê a fila dele. Uma pessoa pode estar em mais de um setor; quem não está em nenhum vê tudo.")}
          </DialogDescription>
        </DialogHeader>
        {membros.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
        ) : elegiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Ninguém na equipe ainda. Convide pessoas em Equipe.")}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {elegiveis.map((m) => {
              const id = `membro-${m.user_id}`;
              return (
                <li key={m.user_id}>
                  <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                    <input
                      id={id}
                      type="checkbox"
                      className="size-4"
                      checked={marcados.has(m.user_id)}
                      onChange={(e) =>
                        setMarcados((atual) => {
                          const proximo = new Set(atual);
                          if (e.target.checked) proximo.add(m.user_id);
                          else proximo.delete(m.user_id);
                          return proximo;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.full_name || m.email}</span>
                    <span className="text-xs text-muted-foreground">{m.role}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuDePrimeiroContato({ setores }: { setores: Setor[] }) {
  const t = useT();
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => apiClient.get<{ data: ConfiguracaoDeSetores }>("/api/v1/settings/setores"),
    select: (r) => configuracaoDeSetoresSchema.parse(r.data),
  });
  const [form, setForm] = useState<ConfiguracaoDeSetores | null>(null);
  const valor = form ?? config.data ?? configuracaoDeSetoresSchema.parse({});

  const salvar = useMutation({
    mutationFn: async (patch: Partial<ConfiguracaoDeSetores>) =>
      apiClient.patch<{ data: ConfiguracaoDeSetores }>("/api/v1/settings/setores", patch),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
      setForm(null);
      toast.success(t("Menu salvo."));
    },
  });

  const opcoes = opcoesDoMenu(setores.map((s) => ({ id: s.id, name: s.name, position: s.position })));
  const podeLigar = opcoes.length >= 2;
  const alterar = (patch: Partial<ConfiguracaoDeSetores>) => setForm({ ...valor, ...patch });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("Menu de primeiro contato")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Quando alguém escreve pela primeira vez, o sistema responde com a lista de setores e direciona pela resposta. A equipe pode transferir depois, a qualquer momento.",
          )}
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border bg-card p-3">
        <Switch
          id="menu-ativo"
          checked={valor.menu_ativo}
          disabled={!podeLigar && !valor.menu_ativo}
          onCheckedChange={(v) => alterar({ menu_ativo: v })}
        />
        <Label htmlFor="menu-ativo" className="flex-1">
          {t("Perguntar o setor no primeiro contato")}
        </Label>
        {!podeLigar && (
          <span className="text-xs text-muted-foreground">{t("Precisa de pelo menos 2 setores")}</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="menu-saudacao">{t("Saudação")}</Label>
            <Textarea
              id="menu-saudacao"
              rows={3}
              maxLength={500}
              value={valor.saudacao}
              onChange={(e) => alterar({ saudacao: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-lembrete">{t("Quando não entender (um lembrete, só)")}</Label>
            <Textarea
              id="menu-lembrete"
              rows={2}
              maxLength={300}
              value={valor.lembrete}
              onChange={(e) => alterar({ lembrete: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-confirmacao">{t("Confirmação")}</Label>
            <Textarea
              id="menu-confirmacao"
              rows={2}
              maxLength={300}
              value={valor.confirmacao}
              onChange={(e) => alterar({ confirmacao: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("{setor} vira o nome do setor escolhido.")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-padrao">{t("Se o cliente não escolher, cai em")}</Label>
            <Select
              value={valor.setor_padrao_id ?? "__nenhum__"}
              onValueChange={(v) => alterar({ setor_padrao_id: v === "__nenhum__" ? null : v })}
            >
              <SelectTrigger id="menu-padrao" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum__">{t("Nenhum setor (fica na fila geral)")}</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("Como o cliente vai receber")}</div>
          <div
            data-testid="previa-do-menu"
            className="whitespace-pre-wrap rounded-2xl bg-[var(--chat-in)] px-4 py-3 text-sm shadow-[var(--chat-bolha-sombra)]"
          >
            {opcoes.length >= 2
              ? montarTextoDoMenu(valor.saudacao, opcoes)
              : t("Crie pelo menos dois setores para ver a prévia.")}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={form === null || salvar.isPending}
          onClick={() => {
            if (!form) return;
            const { menu_ativo, saudacao, lembrete, confirmacao, setor_padrao_id } = form;
            salvar.mutate({ menu_ativo, saudacao, lembrete, confirmacao, setor_padrao_id });
          }}
        >
          {salvar.isPending ? t("Salvando…") : t("Salvar menu")}
        </Button>
      </div>
    </section>
  );
}
