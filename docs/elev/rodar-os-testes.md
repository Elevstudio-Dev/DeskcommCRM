# Rodar os testes na máquina de desenvolvimento

Três suítes, três garantias diferentes. A ordem abaixo é a que dá resposta
rápida primeiro.

## 1. Unitária — segundos, roda sempre

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
```

Verde aqui não prova produto, prova que as peças fazem o que dizem.
Referência de tamanho: 620 arquivos, 6.831 testes (2026-09-03).

## 2. E2E — ~30 minutos, e **precisa de seed**

```bash
pnpm elev:semear     # ANTES. Sem isto o resultado não vale.
pnpm exec playwright test
```

### Por que o `elev:semear` existe

O CI semeia o banco com cinco scripts antes de rodar o E2E. Rodar o Playwright
local sem eles não dá "quase o resultado do CI" — dá um resultado **diferente**,
com falhas que não são defeito nenhum.

Medido em 2026-09-03: as duas specs de `central-de-avisos-capacidades`
falhavam local e passavam no CI. A diferença inteira era
`seed-e2e-capacidades-ausentes`, que cria o aviso pelo emissor real. Sem ele o
aviso não existe, a tela não tem o que mostrar, e o teste acusa a tela.

Duas falhas fantasma custam mais caro do que parecem: elas ensinam a ignorar
vermelho. Quando todo mundo já sabe que "aquelas duas sempre falham", a
terceira — a de verdade — passa junto.

### A armadilha do arquivo de env

O workflow do CI chama os seeds com `--env-file=.env.local`, porque **lá** é o
`.env.local` que tem o conjunto completo. Aqui quem tem é o `.env.e2e`, e o
`.env.local` guarda outra coisa (as variáveis de marca).

Copiar a linha do CI ao pé da letra falha assim:

```
NEXT_PUBLIC_SUPABASE_URL: Invalid input: expected string, received undefined
```

O erro aponta para o Supabase e o que faltou foi o arquivo de env. O
`elev:semear` escolhe o arquivo que **existe** em vez de supor qual é.

### Quando o CI ganhar um seed novo

Ele entra em `scripts/elev-semear-e2e.sh`. A lista de lá é cópia da de
`.github/workflows/e2e.yml`; se as duas divergirem, a diferença volta a aparecer
disfarçada de defeito. Conferir na sincronização mensal
([sincronizar-com-upstream.md](sincronizar-com-upstream.md)).

## 3. `vps-fresh-onboarding` — não roda aqui, e é para ser assim

Essa spec falha nesta máquina de propósito:

```
esta suite APAGA dados da organizacao que resolver aqui, e nao achou o dono
(dono@qa.local).
```

Ela testa a instalação **do zero**: banco vazio, dono criado pelo
`bootstrap-owner.ts`, WAHA e Redis de verdade, sem Resend. Fica fora da lista do
CI por isso, e se prova numa VPS.

O `throw` é proposital, e vale mais que um `skip`: a doutrina do repo
(`docs/testing/user-journey-map.md`) diz que **um `skip` silencioso é
indistinguível de um `pass`**. Além disso a suíte é destrutiva — ela zera
`onboarded_at` e apaga `ai_agents` e `channel_sessions` da organização que
resolver. Em 2026-09-03 ela resolveu "a primeira" e derrubou o onboarding e a
sessão de WhatsApp de uma instalação real de trabalho. Um teste destrutivo que
não sabe em quem está mexendo deve parar, nunca escolher alguém.

## Onde os números ficam

`pnpm elev:estado` remede tudo e reescreve [ESTADO.md](ESTADO.md). Rodar depois
de mexer no produto, para a documentação não envelhecer sozinha.
