# Setores, chat interno e mensagens prontas com parâmetros — desenho

**Data:** 2026-09-11 · **Pedido:** Carlos (Elev Studio) · **Ordem de entrega decidida:**
mensagens com parâmetros → setores → chat interno (cada uma testada no meio).

Decisões tomadas com o Carlos antes deste documento:

| Pergunta | Decisão |
|---|---|
| Como a conversa chega ao setor? | **Menu automático no primeiro contato** (lista numerada); a equipe transfere entre setores a qualquer momento |
| O que um atendente de setor enxerga? | **Só o(s) setor(es) dele**; manager/admin veem tudo; quem não está em setor nenhum vê tudo (como hoje) |
| Formato do chat interno | **Canais por setor + Geral + direto 1:1**, painel aberto pela barra superior, histórico guardado |

O exemplo que guia tudo: uma loja de informática com os setores **Assistência**,
**Financeiro** e **Recepção**.

---

## 1. Mensagens prontas com parâmetros

### O que existe

`/app/templates` ("Respostas rápidas", tabela `message_templates`: título, corpo,
atalho, pessoal ou compartilhada). No composer do inbox, `/` abre o menu e o
corpo é interpolado por `lib/inbox/template-vars.ts`, que conhece **só**
`{{nome}}` e `{{primeiro_nome}}` (do contato). Qualquer outro `{{x}}` fica
literal no texto — e vai para o cliente assim se ninguém notar.

Da tela de Contatos já existe "Iniciar conversa no Inbox": é por ali que o
"primeiro contato com quem eu ainda não falei" começa.

### O que muda

**Parâmetro é qualquer `{{chave}}`.** Três são **automáticos** e chegam
preenchidos: `{{nome}}` (ou `{{nome_cliente}}`), `{{primeiro_nome}}` e
`{{atendente}}` (nome de quem está logado). Todo o resto — `{{numero_pedido}}`,
`{{valor}}`, `{{data_entrega}}` — é **livre**: vira um campo para preencher na
hora de usar. Chaves aceitam acento e número (`{{número_do_pedido}}`), e o
rótulo do campo é a chave humanizada ("Número do pedido").

**A janelinha.** Ao escolher uma mensagem no composer (pelo `/` ou pelo botão
novo de mensagens prontas), se ela tem algum parâmetro livre — ou um automático
sem valor (contato sem nome) — abre um diálogo com um campo por parâmetro, na
ordem em que aparecem no texto, os automáticos já preenchidos (editáveis), e
uma **prévia** do texto final. "Usar mensagem" põe o texto pronto no campo do
composer, com o cursor no fim; o envio continua sendo o botão de enviar — a
pessoa revisa antes de mandar, porque isso chega no celular de um cliente.
Mensagem sem parâmetro livre e com os automáticos resolvidos entra direto, como
hoje.

**O formulário da mensagem** ganha: chips para inserir os automáticos no
cursor, um campo "novo parâmetro" que insere `{{o_que_foi_digitado}}`, e uma
linha viva "Esta mensagem pede: Número do pedido · Nome (automático) …". A
lista de mensagens mostra os parâmetros de cada uma.

**Botão visível no composer.** Quem vem do WhatsApp não sabe que `/` abre um
menu. Um botão de "mensagens prontas" na pílula abre o mesmo menu.

### Peças

| Peça | Responsabilidade |
|---|---|
| `lib/inbox/parametros-de-mensagem.ts` | Puro. `extrairParametros(corpo)`, `valoresAutomaticos({contato, atendente})`, `preencher(corpo, valores)`, `precisaDeJanela(parametros, valores)`, `rotuloDe(chave)`. Substitui `template-vars.ts` (que fica como reexport até ninguém mais importar). |
| `components/inbox/composer/PreencherParametrosDialog.tsx` | O diálogo: campos + prévia + "Usar mensagem". |
| `components/inbox/Composer.tsx` | Decide entre inserir direto e abrir o diálogo; ganha o botão de mensagens prontas. |
| `app/app/templates/_components/TemplateFormDialog.tsx` | Chips, "novo parâmetro", linha "esta mensagem pede". |
| `app/app/templates/_components/TemplatesClient.tsx` | Chips dos parâmetros na lista. |

### Testes

- Unidade (puro): extração em ordem e sem repetição; acentos e números;
  humanização do rótulo; automáticos preenchidos e livres vazios; `preencher`
  mantém literal o que não tem valor; `precisaDeJanela` é falso quando tudo
  resolve e verdadeiro com um livre ou um automático vazio.
- Componente: o diálogo mostra um campo por parâmetro, automáticos
  preenchidos, botão travado até os livres terem valor, prévia acompanha.
- O que NÃO muda: `message_templates` no banco; a API; o `/` do composer.

---

## 2. Setores

### Modelo

- `sectors` — `id, organization_id, name, color (paleta de marcadores),
  position, archived_at`. Único por `(organization_id, lower(name))`.
- `sector_members` — `sector_id, user_id, organization_id`. Uma pessoa pode
  estar em vários setores.
- `conversations.sector_id` — nulo até alguém (o menu ou a equipe) decidir.
- `conversation_assignment_events` ganha `from_sector_id`/`to_sector_id` e os
  motivos `sector_menu` (o cliente escolheu) e `sector_transfer` (a equipe
  moveu). O chip de "quem assumiu" no fio passa a descrever também "Transferida
  para Financeiro por Ana".
- `organizations.settings.setores` — `{ menu_ativo, saudacao, setor_padrao_id,
  lembrete_ativo }`.

### Menu automático de primeiro contato

Dispara quando chega mensagem de um contato numa conversa **sem setor, sem
responsável, que nunca recebeu resposta nossa**, e a organização tem o menu
ligado com ≥ 2 setores ativos. O sistema responde a saudação + a lista
numerada ("1 · Assistência / 2 · Financeiro / 3 · Recepção") e grava em
`conversations.metadata.menu_setores` as opções oferecidas.

A próxima mensagem do contato é lida contra as opções: número, ou nome do setor
(sem acento, sem caixa). Casou → `sector_id`, evento `sector_menu`, confirmação
curta ("Certo — você está falando com o Financeiro."). Não casou → um lembrete
(uma vez); depois cai no setor padrão, com evento `sector_menu` e
`metadata.menu_setores.resultado = "padrao"`. Enquanto o menu aguarda resposta,
**o agente de IA não responde** naquela conversa: a escolha de setor vem antes.

Vive em `lib/setores/menu.ts`, sem nome de provedor: manda pela capacidade do
canal (`getAdapter(provider)`), como manda a doutrina de canal. A ingestão
chama `decidirMenu(conversa, mensagem)` depois de persistir a mensagem.

### Rodízio e visibilidade

- Rodízio (`lib/routing/eligibles.ts`): com `sector_id` definido e o setor com
  membros, só os membros são elegíveis; sem setor, todos (como hoje).
- Visibilidade (`fn_can_view_conversation`, RLS): quem está em ≥ 1 setor e não
  é manager+ vê as conversas dos seus setores **e** as sem setor (a fila antes
  do menu precisa de dono se o menu falhar). Combina por E com o
  `visibility_mode` atual. Manager/admin e quem não está em setor nenhum veem
  tudo.

### Telas

- Configurações → Organização → **Setores**: criar/renomear/arquivar, cor,
  membros (multi-seleção da equipe), e o bloco do menu (ligado/desligado,
  saudação, setor padrão, lembrete).
- Inbox: filtro por setor; chip colorido do setor na linha; no cabeçalho da
  conversa, "Transferir para setor…" com o setor atual visível.
- Desempenho: uma quebra por setor (fase seguinte, se houver medida útil).

### Testes

- Unidade: o leitor de resposta do menu (número, nome, acento, ruído);
  elegibilidade por setor; a decisão de disparar o menu (cada condição
  negada isoladamente).
- Banco (invariantes): RLS de setor por papel; realtime dos eventos continua
  entregando; baseline em bloco único antes da varredura de `anon`.
- E2E: cliente novo recebe o menu, responde "2", cai no Financeiro; atendente
  do Financeiro vê; atendente da Assistência não vê; manager transfere.

---

## 3. Chat interno

### Modelo

- `team_channels` — `id, organization_id, kind ('geral'|'setor'|'direto'),
  sector_id, name`. Um `geral` por organização (criado sob demanda); um
  `setor` por setor (nasce com ele, some ao arquivar); `direto` entre duas
  pessoas (único por par).
- `team_channel_members` — `channel_id, user_id, last_read_at`. `geral`:
  todo membro da organização; `setor`: membros do setor + manager+;
  `direto`: os dois.
- `team_messages` — `id, organization_id, channel_id, sender_user_id, body,
  created_at`. Na publicação `supabase_realtime`, com política de SELECT
  `to authenticated` que **nunca levanta** (a lição do walrus: uma política
  que erra derruba o lote inteiro para todo mundo).

### Tela

Ícone de chat na barra superior (contador de não lidas) abre um painel à
direita: lista de canais (Geral, os setores, as pessoas) e o fio com composer.
No celular, tela inteira. Nova mensagem com o painel fechado avisa como aviso
de mensagem recebida (mesmo mecanismo de `useInboundMessageAlerts`). Sem
menções nem anexos na primeira versão — texto, e só.

### Testes

- Unidade: contagem de não lidas; resolução do canal direto (par ordenado).
- Banco: RLS por canal (quem não é membro não lê); realtime entrega.
- E2E: duas sessões, mensagem chega em tempo real, contador some ao ler.

---

## Fora deste desenho, de propósito

- Menções, anexos e reações no chat interno.
- Setor escolhido pela IA (a decisão foi o menu; a IA pode vir depois como
  alternativa ao menu, não junto).
- Mensagens prontas com mídia.
