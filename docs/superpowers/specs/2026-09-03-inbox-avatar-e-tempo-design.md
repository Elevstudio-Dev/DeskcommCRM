# Inbox: foto do contato, tempo sem resposta e cabeçalho denso

**Data:** 2026-09-03
**Status:** aprovado em conversa, pronto para implementação
**Escopo:** Elev CRM (fork). Nada aqui é candidato a PR upstream — é decisão de
produto nossa sobre como o atendimento deve parecer e se comportar.

---

## Por que

Duas lacunas medidas na tela, e uma terceira que é dívida de manutenção:

1. **Contato sem rosto.** O mecanismo de foto existe inteiro no repositório —
   coluna `contacts.avatar_storage_path`, cron `contact-avatars`, rota
   `contacts/[id]/avatar`, bucket privado — e **nenhuma tela consome**. Medido:
   `grep -c avatar components/inbox/ConversationHeader.tsx` → 0, e no banco
   todos os contatos com `avatar_storage_path` nulo. Não é feature a construir;
   é feature construída e nunca ligada.

2. **Ninguém sabe há quanto tempo o cliente espera.** Não existe conceito de
   tempo sem resposta em lugar nenhum da interface. O dado existe
   (`conversations.last_inbound_at`, mantido pela ingestão), a leitura não.

3. **Seis botões no cabeçalho.** Assumir, Liberar, Devolver ao automático,
   Pausar o automático, Transferir, Fechar — mais Lembrar. A densidade esconde
   qual é a ação do momento.

## O que NÃO entra

- **Badge "VENDA"** da referência visual: não há equivalente no domínio do Elev.
  Criar um seria feature nova disfarçada de ajuste de tela.
- **Alterar o cron ou a rota de avatar.** Estão prontos e bem construídos. O
  comentário do cron explica por que guardam o arquivo e não a URL (a URL do
  CDN do WhatsApp expira — medido em 9 dias numa instalação real). Não há o que
  melhorar ali.
- **Ordenar a fila por urgência.** Exigiria campo calculado no Postgres. Fica
  como evolução; a função de faixa desta entrega é reaproveitável inteira.

---

## 1. Foto do contato

**Componente único** `components/contacts/AvatarDoContato.tsx`, consumido em três
lugares: cabeçalho da conversa, lista lateral do Inbox, tela de Contatos.

```
<AvatarDoContato nome={string} avatarUrl={string | null} tamanho="sm" | "md" />
```

Sem `avatarUrl`, cai na inicial do nome — que é o que a tela já faz hoje. Nunca
fica buraco, e o estado "ainda não sincronizou" é indistinguível de "contato sem
foto no WhatsApp", o que é correto: os dois significam "não temos o rosto".

**Origem da URL:** rota existente `GET /api/v1/contacts/[id]/avatar`, que devolve
URL assinada do bucket privado. Nenhum endpoint novo.

**População:** o cron `contact-avatars` já faz. Em ambiente local ele não roda
sozinho (nenhum cron roda) — disparo manual com o `INTERNAL_SECRET`.

## 2. Tempo sem resposta

**Regra pura**, `lib/inbox/tempo-sem-resposta.ts`, sem banco e sem relógio real:

```ts
tempoSemResposta({
  lastInboundAt: string | null,
  lastOutboundAt: string | null,
  status: string,
  agora: Date,            // injetado — nunca Date.now() dentro da função
  limiteMinutos: number,
}): { minutos: number; faixa: Faixa; rotulo: string } | null
```

**Devolve `null` — e a tela não mostra nada — em três casos:**

| Caso | Por quê |
|---|---|
| `status` é `closed` ou `archived` | Ninguém está esperando. Contador correndo seria alarme falso permanente. |
| `lastInboundAt` é nulo | O cliente nunca escreveu. Contar desde o nada inventa espera que não houve. |
| `lastOutboundAt > lastInboundAt` | **O atendente já respondeu — a bola está com o cliente.** É o caso que separa esta métrica de "tempo desde a última mensagem de qualquer um": sem ele, o contador correria enquanto o cliente é que está devendo resposta. |

Limite ausente NÃO é um quarto caso de `null` — cai no piso, ver abaixo.

**Faixas, derivadas do limite e não fixas:**

- `ok` — até ⅓ do limite
- `atencao` — até o limite
- `estourado` — acima

Quem configurar 60 minutos ganha 20/60, não 5/15. Fixar 5 e 15 faria a
configuração mentir para todo mundo que não escolhesse 15.

**Configuração:** `organizations.settings.sla.primeira_resposta_minutos`.
Sem migration — `settings` é `jsonb` e já carrega `llm`, `routing`, `branding`,
`visibility_mode`. **Ausência não é erro:** cai no piso de 15 minutos e o
contador aparece sem cor de alarme. Um produto que quebra a tela porque ninguém
configurou SLA é pior que um que assume um padrão e diz qual é.

**Relógio na tela:** `useEffect` com intervalo de 30s recalculando o rótulo a
partir de `Date.now()`. Não consulta servidor, não invalida cache, não
re-renderiza a conversa — só o badge.

## 3. Cabeçalho

**Badges** (os três existentes reestilizados de `outline` para compacto e
colorido, mais o contador):

`[avatar] Nome  •  telefone  •  [status] [dono] [motivo] [⏱ tempo]`

O telefone já é calculado no componente (`phoneForDisplay`) e simplesmente não
era renderizado.

**Ações — o que fica visível e o que vai para o `⋯`:**

| Visível | No dropdown |
|---|---|
| Assumir **ou** Liberar (a ação do momento) | Devolver ao automático |
| Transferir | Pausar o automático |
| Fechar | Lembrar (snooze) |

**Invariante que não pode ser violado:** nunca esconder a ÚNICA ação disponível.
Se o estado da conversa deixa só "Devolver ao automático" possível, ele sai do
dropdown e vira botão.

Isto não é zelo abstrato. O comentário em `ConversationHeader.tsx` documenta um
beco sem saída medido: a volta ao automático já foi condicionada a
`status !== "closed"`, e o resultado foi atendente que assume, fecha, sai de
férias — e a conversa fica com o automático parado e **nenhuma porta** para o
colega, porque "Liberar" só existe para o próprio dono. Agrupar ações recria
exatamente esse risco se a regra não for explícita.

---

## Testes

**`lib/inbox/tempo-sem-resposta.test.ts`** — regra pura, sem banco:

- os três casos de `null`, um a um
- as três faixas
- derivação a partir de limite configurado (60min → vira 20/60, não 5/15)
- a virada exatamente NO limite (fronteira, não meio da faixa)
- `agora` sempre injetado — nunca relógio real. O teste deles de fuso quebra
  quando o relógio do runner bate 14:30 UTC (issue upstream #506); não repetir.

**Componentes:** o avatar cai na inicial sem URL; o cabeçalho não mostra
contador em conversa fechada; o dropdown não engole a última ação.

**Regressão obrigatória:** `pnpm test:unit` completo. Foi ele que pegou meus
três erros nesta sessão (régua de audit, i18n espanhol, guard de tag).

## Riscos

| Risco | Mitigação |
|---|---|
| Agrupar ações esconde a única saída | Invariante explícito + teste |
| Contador vira alarme falso | Os três casos de `null` existem só para isso |
| Strings novas sem espanhol | O guard `i18n-espanhol-cobre-a-tela` reprova — já me pegou hoje |
| Marca cravada em teste | Não escrever "Elev CRM" em asserção; foi o bug do #492 e reapareceu no E2E |
