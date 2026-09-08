# Inbox: foto, tempo sem resposta e cabeçalho denso — Plano de Implementação

> **Para executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa.
> Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** O cabeçalho da conversa passa a mostrar rosto, telefone e há quanto tempo o cliente espera — e agrupa as ações ocasionais sem nunca esconder a única disponível.

**Architecture:** Três entregas independentes. A foto REUSA o padrão de `<Avatar>` do Radix já estabelecido em `ConversationListItem.tsx` (nenhum componente novo). O contador é função pura sem banco e sem relógio real, lendo `conversations.last_inbound_at`, que já existe e já é mantida. O limite por organização vive em `organizations.settings.sla` — `jsonb` que já carrega `llm`, `routing`, `branding` e `visibility_mode`, então sem migration.

**Tech Stack:** Next.js 16 · React 19 · TypeScript 6 estrito · Vitest 4 · Radix Avatar · Tailwind

**Spec:** `docs/superpowers/specs/2026-09-03-inbox-avatar-e-tempo-design.md`

## Global Constraints

- **Comentários em PT-BR** — é a norma do repo; mantenha o idioma do arquivo editado.
- **Toda string nova em `t()` precisa de espanhol** em `lib/i18n/dicionario.ts`. O guard `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` reprova sem isso.
- **Nunca escrever "Elev CRM" nem "Elev CRM" em asserção de teste.** Quebra em instalação com marca própria — foi o bug do PR #492 e reapareceu no E2E `signup-journey.spec.ts`.
- **`console.log` é proibido** — use `lib/logger.ts`.
- **`agora` sempre injetado em teste**, nunca `Date.now()` dentro da função. O teste de fuso do upstream quebra quando o relógio do runner bate 14:30 UTC (issue #506).
- **Piso do SLA: 15 minutos**, confirmado com o dono do produto.
- **Verificação a cada commit:** `pnpm typecheck && pnpm test:unit`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/inbox/tempo-sem-resposta.ts` **(criar)** | A regra pura: quanto tempo, qual faixa, ou `null` |
| `lib/inbox/tempo-sem-resposta.test.ts` **(criar)** | Os casos de `null`, as faixas, a fronteira |
| `hooks/inbox/useLimiteDeResposta.ts` **(criar)** | Lê o limite da organização, cai no piso |
| `components/inbox/ConversationHeader.tsx` **(modificar)** | Avatar, telefone, badge de tempo, dropdown |
| `lib/i18n/dicionario.ts` **(modificar)** | Espanhol das strings novas |

Nenhum componente de avatar novo: o padrão está em `ConversationListItem.tsx:167-182` e é replicado.

---

### Task 1: A regra do tempo sem resposta

**Files:**
- Create: `lib/inbox/tempo-sem-resposta.ts`
- Test: `lib/inbox/tempo-sem-resposta.test.ts`

**Interfaces:**
- Consumes: nada (função pura, primeira tarefa)
- Produces: `tempoSemResposta(entrada: EntradaDoTempo): TempoSemResposta | null`, `type Faixa = "ok" | "atencao" | "estourado"`, `const PISO_MINUTOS = 15`

- [ ] **Step 1: Escrever o teste que falha**

Criar `lib/inbox/tempo-sem-resposta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { tempoSemResposta, PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

const AGORA = new Date("2026-09-03T12:00:00Z");
const base = {
  lastInboundAt: "2026-09-03T11:40:00Z",
  lastOutboundAt: null,
  status: "open",
  agora: AGORA,
  limiteMinutos: 15,
};

describe("tempoSemResposta", () => {
  it("conta os minutos desde a ultima mensagem do cliente", () => {
    expect(tempoSemResposta(base)?.minutos).toBe(20);
  });

  it("conversa fechada nao mostra contador", () => {
    // Ninguem esta esperando. Um contador correndo aqui seria alarme falso
    // permanente em toda conversa encerrada da lista.
    expect(tempoSemResposta({ ...base, status: "closed" })).toBeNull();
    expect(tempoSemResposta({ ...base, status: "archived" })).toBeNull();
  });

  it("cliente que nunca escreveu nao tem espera para contar", () => {
    expect(tempoSemResposta({ ...base, lastInboundAt: null })).toBeNull();
  });

  it("quando o atendente ja respondeu, a bola esta com o cliente", () => {
    // ESTE e o caso que separa "tempo desde a mensagem do CLIENTE" de "tempo
    // desde a ultima mensagem". Sem ele, o contador correria enquanto o
    // cliente e que esta devendo resposta.
    expect(
      tempoSemResposta({ ...base, lastOutboundAt: "2026-09-03T11:45:00Z" }),
    ).toBeNull();
  });

  it("limite ausente cai no piso, e nao some da tela", () => {
    const r = tempoSemResposta({ ...base, limiteMinutos: 0 });
    expect(r).not.toBeNull();
    expect(r?.minutos).toBe(20);
  });

  it("as faixas derivam do limite, nao sao fixas", () => {
    // Com limite 60, o terco e 20 — quem configurou 60 nao deve herdar a
    // regua de quem ficou nos 15.
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:50:00Z", limiteMinutos: 60 })?.faixa,
    ).toBe("ok");
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:20:00Z", limiteMinutos: 60 })?.faixa,
    ).toBe("atencao");
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T10:30:00Z", limiteMinutos: 60 })?.faixa,
    ).toBe("estourado");
  });

  it("exatamente NO limite ainda e atencao, nao estourado", () => {
    // A fronteira, nao o meio da faixa: e onde erro de comparacao mora.
    expect(
      tempoSemResposta({ ...base, lastInboundAt: "2026-09-03T11:45:00Z", limiteMinutos: 15 })?.faixa,
    ).toBe("atencao");
  });

  it("o piso e 15", () => {
    expect(PISO_MINUTOS).toBe(15);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run lib/inbox/tempo-sem-resposta.test.ts`
Expected: FAIL — "Failed to resolve import" ou "tempoSemResposta is not a function"

- [ ] **Step 3: Implementar o mínimo**

Criar `lib/inbox/tempo-sem-resposta.ts`:

```ts
/**
 * Ha quanto tempo o cliente espera resposta — ou `null` quando nao ha espera.
 *
 * A METRICA, escolhida pelo dono do produto: tempo desde a ultima mensagem do
 * CLIENTE. Nao e "tempo desde a ultima mensagem" nem "idade da conversa". A
 * diferenca aparece no terceiro caso de `null` abaixo, e e ela que faz o
 * contador significar "a bola esta com a gente".
 *
 * Funcao pura, com `agora` injetado. Relogio real dentro da regra e o que faz
 * um teste passar 23h por dia e reprovar na vigesima quarta — o repo ja tem
 * esse defeito medido (issue upstream #506).
 */

/** Verde ate um terco do limite, amarelo ate o limite, vermelho depois. */
export type Faixa = "ok" | "atencao" | "estourado";

/**
 * O limite quando a organizacao nao configurou nenhum.
 *
 * Nao e um palpite disfarcado de padrao: enquanto ninguem escolher, TODA
 * organizacao usa este numero, e a tela diz qual e. Um produto que quebra
 * porque ninguem preencheu SLA e pior que um que assume 15 e conta.
 */
export const PISO_MINUTOS = 15;

export interface EntradaDoTempo {
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  status: string;
  agora: Date;
  /** `organizations.settings.sla.primeira_resposta_minutos`. 0 ou ausente cai no piso. */
  limiteMinutos: number;
}

export interface TempoSemResposta {
  minutos: number;
  faixa: Faixa;
  /** Pronto para a tela: "3 min", "1h 20", "2 d". */
  rotulo: string;
}

/** Conversa encerrada nao espera ninguem. */
const ENCERRADAS = new Set(["closed", "archived"]);

function rotuloDe(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 60 * 24) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}`;
  }
  return `${Math.floor(minutos / (60 * 24))} d`;
}

function faixaDe(minutos: number, limite: number): Faixa {
  if (minutos <= limite / 3) return "ok";
  // `<=` e nao `<`: exatamente no limite ainda e atencao. Estourar e passar,
  // nao chegar.
  if (minutos <= limite) return "atencao";
  return "estourado";
}

export function tempoSemResposta(e: EntradaDoTempo): TempoSemResposta | null {
  // (1) Conversa encerrada: ninguem esta esperando.
  if (ENCERRADAS.has(e.status)) return null;

  // (2) O cliente nunca escreveu: nao ha espera para contar.
  if (!e.lastInboundAt) return null;

  const entrada = new Date(e.lastInboundAt).getTime();
  if (Number.isNaN(entrada)) return null;

  // (3) O atendente ja respondeu DEPOIS: a bola esta com o cliente.
  if (e.lastOutboundAt) {
    const saida = new Date(e.lastOutboundAt).getTime();
    if (!Number.isNaN(saida) && saida >= entrada) return null;
  }

  const minutos = Math.floor((e.agora.getTime() - entrada) / 60_000);
  if (minutos < 0) return null;

  const limite = e.limiteMinutos > 0 ? e.limiteMinutos : PISO_MINUTOS;

  return { minutos, faixa: faixaDe(minutos, limite), rotulo: rotuloDe(minutos) };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run lib/inbox/tempo-sem-resposta.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add lib/inbox/tempo-sem-resposta.ts lib/inbox/tempo-sem-resposta.test.ts
git commit -m "feat(inbox): a regra de ha quanto tempo o cliente espera"
```

---

### Task 2: Avatar e telefone no cabeçalho

**Files:**
- Modify: `components/inbox/ConversationHeader.tsx`

**Interfaces:**
- Consumes: nada da Task 1 (independente — pode ser feita em paralelo)
- Produces: o cabeçalho renderizando `<Avatar>` e o telefone; nenhuma exportação nova

- [ ] **Step 1: Adicionar o import**

No topo de `components/inbox/ConversationHeader.tsx`, junto dos outros imports de UI:

```ts
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
```

- [ ] **Step 2: Adicionar a função de iniciais**

Antes da declaração do componente. É a mesma lógica de `ConversationListItem.tsx:73` — replicada e não importada porque aquele arquivo não a exporta, e exportá-la de lá seria mexer num arquivo fora do escopo desta entrega.

```ts
/** Duas letras para o circulo, com o telefone como rede quando nao ha nome. */
function iniciais(nome: string | null | undefined, reserva: string): string {
  const fonte = (nome ?? "").trim() || reserva;
  const partes = fonte.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}
```

- [ ] **Step 3: Renderizar avatar e telefone**

Localizar a linha `<h2 className="truncate text-sm font-semibold">{displayName}</h2>` (por volta da 143). Inserir o avatar imediatamente ANTES do `<h2>`, dentro do mesmo container flex:

```tsx
<Avatar className="h-8 w-8 shrink-0">
  {c?.avatar_storage_path && !c?.is_anonymized ? (
    <AvatarImage src={`/api/v1/contacts/${c.id}/avatar`} alt="" className="object-cover" />
  ) : null}
  <AvatarFallback className="text-[10px]">
    {iniciais(displayName, phone ?? "?")}
  </AvatarFallback>
</Avatar>
```

O `AvatarImage` condicional é o padrão de `ConversationListItem.tsx:167-182`: só monta a `<img>` quando existe arquivo, senão o browser pediria a rota para todo contato e levaria 404 em cada um sem foto. O `is_anonymized` é o gate de LGPD e não pode ser removido.

E, logo APÓS o `<h2>`, o telefone — que já está calculado na variável `phone` e simplesmente nunca era renderizado:

```tsx
{phone ? (
  <span className="hidden truncate text-xs text-muted-foreground sm:inline">{phone}</span>
) : null}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck`
Expected: exit 0. Nenhuma string em `t()` foi adicionada nesta tarefa, então o guard de espanhol não é afetado.

- [ ] **Step 5: Commit**

```bash
git add components/inbox/ConversationHeader.tsx
git commit -m "feat(inbox): o cabecalho da conversa passa a ter rosto e telefone"
```

---

### Task 3: O badge de tempo no cabeçalho

**Files:**
- Modify: `components/inbox/ConversationHeader.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `tempoSemResposta`, `PISO_MINUTOS` da Task 1
- Produces: o badge renderizado; nenhuma exportação nova

- [ ] **Step 1: Importar a regra e os hooks**

```ts
import { useEffect, useState } from "react";

import { tempoSemResposta, PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";
```

`useState` pode já estar importado (o arquivo usa `useState` para `reassignOpen`) — nesse caso apenas acrescente `useEffect` ao import existente, sem duplicar a linha.

- [ ] **Step 2: O relógio da tela**

Dentro do componente, junto dos outros hooks:

```tsx
/**
 * O relogio que faz o contador andar.
 *
 * 30s e o intervalo em que o numero muda de forma perceptivel sem custo: a
 * regra e pura e local, entao isto NAO consulta servidor, NAO invalida cache e
 * NAO re-renderiza a conversa — so o badge.
 */
const [agora, setAgora] = useState(() => new Date());
useEffect(() => {
  const id = setInterval(() => setAgora(new Date()), 30_000);
  return () => clearInterval(id);
}, []);

const espera = tempoSemResposta({
  lastInboundAt: conversation.last_inbound_at ?? null,
  lastOutboundAt: conversation.last_outbound_at ?? null,
  status,
  agora,
  limiteMinutos: PISO_MINUTOS,
});
```

O limite fica no piso nesta tarefa — ler `organizations.settings.sla` exige um hook novo, que é a Task 4. O piso é o comportamento correto enquanto ninguém configurou.

- [ ] **Step 3: Renderizar o badge**

Junto dos outros badges, logo após o de status (por volta da linha 146):

```tsx
{espera ? (
  <Badge
    variant="outline"
    data-faixa={espera.faixa}
    title={t("Tempo desde a última mensagem do cliente sem resposta.")}
    className={
      espera.faixa === "estourado"
        ? "h-4 border-destructive/40 bg-destructive/10 px-1.5 text-[10px] text-destructive"
        : espera.faixa === "atencao"
          ? "h-4 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
          : "h-4 px-1.5 text-[10px] text-muted-foreground"
    }
  >
    {espera.rotulo}
  </Badge>
) : null}
```

- [ ] **Step 4: O espanhol da string nova**

Em `lib/i18n/dicionario.ts`, junto das outras entradas:

```ts
  "Tempo desde a última mensagem do cliente sem resposta.": {
    es: "Tiempo desde el último mensaje del cliente sin respuesta.",
  },
```

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: exit 0 nos dois. Se o guard de espanhol reprovar, a entrada do Step 4 não foi salva — é o erro mais comum aqui.

- [ ] **Step 6: Commit**

```bash
git add components/inbox/ConversationHeader.tsx lib/i18n/dicionario.ts
git commit -m "feat(inbox): o cabecalho diz ha quanto tempo o cliente espera"
```

---

### Task 4: O limite por organização

**Files:**
- Create: `app/api/v1/settings/sla/route.ts`
- Create: `hooks/inbox/useLimiteDeResposta.ts`
- Modify: `components/inbox/ConversationHeader.tsx`

**Interfaces:**
- Consumes: `PISO_MINUTOS` da Task 1
- Produces: `useLimiteDeResposta(): number` — os minutos configurados, ou o piso

- [ ] **Step 1: Criar a rota que le o SLA**

CONFERIDO na escrita deste plano: `/api/v1/settings/tenant` NAO existe. O molde e
`app/api/v1/settings/routing/route.ts`, que le `organizations.settings.routing` do
MESMO jsonb — leia esse arquivo antes e siga a estrutura dele (guard `requireRole`,
`select("settings")`, schema Zod com `.catch(DEFAULT)`).

Criar `app/api/v1/settings/sla/route.ts` com apenas o GET:

```ts
/**
 * GET /api/v1/settings/sla — em quantos minutos a primeira resposta vira alarme.
 *
 * Molde: `settings/routing/route.ts`, que le do MESMO jsonb. Aqui so ha GET —
 * escrever o valor e outra entrega, e uma rota que so le nao precisa do merge
 * nao-destrutivo que o PATCH de routing faz.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "settings_sla" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();

  const settings = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const sla = (settings.sla as Record<string, unknown> | undefined) ?? {};
  const bruto = sla.primeira_resposta_minutos;
  const minutos = typeof bruto === "number" && bruto > 0 ? bruto : PISO_MINUTOS;

  return ok({ primeira_resposta_minutos: minutos }, { requestId });
}
```

`requireRole("agent")` e nao `manager`: quem ATENDE precisa ver o contador, e o
valor nao e sensivel. O gate de `manager` do routing existe porque aquela rota
tambem ESCREVE.

- [ ] **Step 2: Escrever o hook**

Criar `hooks/inbox/useLimiteDeResposta.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { PISO_MINUTOS } from "@/lib/inbox/tempo-sem-resposta";

/**
 * Em quantos minutos a primeira resposta vira alarme, nesta organizacao.
 *
 * Vive em `organizations.settings.sla.primeira_resposta_minutos` — o `jsonb`
 * que ja carrega `llm`, `routing`, `branding` e `visibility_mode`. Sem coluna
 * nova, sem migration: o padrao de configuracao por organizacao ja existe.
 *
 * FALHA ABERTA, de proposito. Erro de rede, chave ausente, valor invalido:
 * tudo cai no piso. Um cabecalho que perde o contador porque a leitura de
 * configuracao falhou troca informacao util por nenhuma — e o operador nao
 * teria como saber que faltou algo.
 */
export function useLimiteDeResposta(): number {
  const { data } = useQuery({
    queryKey: ["org-settings", "sla"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/sla");
      if (!r.ok) return null;
      const j = (await r.json()) as {
        data?: { primeira_resposta_minutos?: unknown };
      };
      const bruto = j.data?.primeira_resposta_minutos;
      return typeof bruto === "number" && bruto > 0 ? bruto : null;
    },
    staleTime: 5 * 60_000,
  });

  return data ?? PISO_MINUTOS;
}
```

A rota do Step 1 ja devolve o numero pronto, com o piso aplicado no servidor. O
hook cai no piso de novo em caso de falha de rede — dois pisos, de proposito: o
do servidor cobre "ninguem configurou", o do cliente cobre "nao consegui
perguntar".

- [ ] **Step 3: Usar o hook no cabeçalho**

Importar e chamar:

```ts
import { useLimiteDeResposta } from "@/hooks/inbox/useLimiteDeResposta";
```

```tsx
const limiteMinutos = useLimiteDeResposta();
```

Substituir `limiteMinutos: PISO_MINUTOS` por `limiteMinutos` na chamada de `tempoSemResposta`. Remover `PISO_MINUTOS` do import do cabeçalho se ficar sem uso — o `pnpm lint` acusa import órfão.

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run lib/inbox/tempo-sem-resposta.test.ts`
Expected: exit 0 nos três.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/settings/sla/route.ts hooks/inbox/useLimiteDeResposta.ts components/inbox/ConversationHeader.tsx
git commit -m "feat(inbox): o limite de primeira resposta e por organizacao"
```

---

### Task 5: Agrupar as ações ocasionais

**Files:**
- Modify: `components/inbox/ConversationHeader.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: nada das tarefas anteriores
- Produces: o cabeçalho com dropdown; nenhuma exportação nova

- [ ] **Step 1: Confirmar o componente de dropdown do repo**

Run: `ls components/ui/dropdown-menu.tsx && grep -rln 'DropdownMenu' components --include=*.tsx | head -3`
Expected: o componente existe e já é usado. Siga o padrão de imports desses arquivos.

**Se não existir: PARE e reporte.** Não instale dependência nova.

- [ ] **Step 2: Contar as ações ANTES de esconder qualquer uma**

Este passo é o invariante do spec, e não é opcional. Junto dos outros cálculos do componente:

```tsx
/**
 * QUANTAS acoes ocasionais existem agora — e por que isto e contado antes de
 * esconder.
 *
 * O agrupamento so pode acontecer quando ha mais de uma saida. O proprio
 * comentario deste arquivo documenta um beco medido: a volta ao automatico ja
 * foi condicionada a `status !== "closed"`, e o resultado foi o atendente que
 * assume, fecha e sai de ferias — deixando a conversa com o automatico parado
 * e NENHUMA porta para o colega, porque "Liberar" so existe para o proprio
 * dono. Esconder acao num dropdown recria exatamente esse risco.
 *
 * Com uma unica acao possivel, ela sai do menu e vira botao.
 */
const ocasionais = [
  travaVigente && !encerrada, // Devolver ao automático
  automaticoAtivo && !encerrada, // Pausar o automático
  !encerrada, // Lembrar (snooze)
].filter(Boolean).length;

const agrupar = ocasionais > 1;
```

- [ ] **Step 3: Renderizar com a guarda**

Quando `agrupar` é verdadeiro, as três ações ocasionais entram num `DropdownMenu` rotulado `t("Mais ações")`. Quando é falso, cada uma disponível é renderizada como botão solto, exatamente como está hoje.

As ações principais — Assumir/Liberar, Transferir, Fechar — **nunca** entram no menu, em nenhum dos dois caminhos.

- [ ] **Step 4: O espanhol da string nova**

```ts
  "Mais ações": { es: "Más acciones" },
```

- [ ] **Step 5: Verificar com a suíte COMPLETA**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: exit 0 nos três. A suíte inteira aqui, não só um arquivo: esta tarefa mexe na estrutura do cabeçalho, e é o run completo que pega regressão em teste de componente.

- [ ] **Step 6: Commit**

```bash
git add components/inbox/ConversationHeader.tsx lib/i18n/dicionario.ts
git commit -m "feat(inbox): as acoes ocasionais saem da barra, menos quando sao a unica"
```

---

### Task 6: Popular as fotos e provar na tela

**Files:** nenhum — é verificação, não código.

- [ ] **Step 1: Disparar o cron de avatares**

```bash
cd ~/elev-crm
# CONFERIDO: o cron aceita INTERNAL_CRON_SECRET **ou** INTERNAL_SECRET
# (`route.ts:60`). Usa o que estiver preenchido.
SEC=$(grep "^INTERNAL_CRON_SECRET=" .env.e2e | cut -d= -f2-)
[ -z "$SEC" ] && SEC=$(grep "^INTERNAL_SECRET=" .env.e2e | cut -d= -f2-)
curl -s -X POST -H "Authorization: Bearer $SEC" \
  http://127.0.0.1:3000/api/v1/cron/contact-avatars -w "\nHTTP=%{http_code}\n"
```

Expected: HTTP 200.

**Se vier 403:** o segredo do `.env.e2e` nao e o que o app carregou (o cron responde 403, nao 401). Confira com `tr '\0' '\n' < /proc/$(pgrep -f 'next start' | head -1)/environ | grep INTERNAL_SECRET` antes de mexer em qualquer outra coisa.

- [ ] **Step 2: Confirmar no banco que alguma foto chegou**

```bash
DB=$(docker ps --filter name=supabase_db --format '{{.Names}}' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -c \
  "select name, avatar_storage_path is not null as tem_foto from public.contacts;"
```

Expected: ao menos um contato com `tem_foto = t`.

**Se nenhum tiver: isto não é falha do plano.** Contato sem foto no WhatsApp, ou número que nunca conversou com a sessão conectada, legitimamente não tem imagem. Confira o log do app antes de concluir que quebrou.

- [ ] **Step 3: Rebuild e olhar a tela**

```bash
set -a; . ./.env.e2e; set +a
pnpm e2e:build && pnpm exec next start -H 0.0.0.0 -p 3000
```

Abrir `http://localhost:3000/app/inbox`, escolher uma conversa e conferir os quatro: rosto no cabeçalho, telefone ao lado do nome, badge de tempo (ou a ausência dele, se o atendente respondeu por último), e o menu de ações.

- [ ] **Step 4: Verificação final**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
```

Expected: exit 0 nos três, com a contagem de testes **maior** que a linha de base de 6.824 — os 8 da Task 1 entraram.

---

## O que este plano NÃO faz

- Não altera o cron `contact-avatars` nem a rota de avatar. Estão corretos e bem construídos.
- Não cria componente de avatar novo. O padrão está em `ConversationListItem.tsx` e é replicado.
- Não cria badge "VENDA" nem ordena a fila por urgência. Ambos ficaram fora do escopo no spec, com a razão escrita.
- Não cria tela de configuração do SLA. O valor é lido de `settings`; escrever nele é outra entrega.
