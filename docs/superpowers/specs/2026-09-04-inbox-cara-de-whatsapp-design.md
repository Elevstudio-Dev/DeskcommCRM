# Inbox com cara de WhatsApp — design

**Data:** 2026-09-04 · **Estado:** implementado

## O problema

Quem atende no Elev CRM passa o dia no Inbox e vem do WhatsApp Web. A distância
entre as duas telas custava tempo de leitura a cada troca de conversa. O pedido
do dono foi literal: *"menos minimalista, mais cara de WhatsApp, para não sentir
uma diferença absurda"*.

## As três decisões que moldaram o resto

Tomadas pelo dono em 2026-09-04, e registradas aqui porque cada uma fecha um
caminho que pareceria óbvio depois:

1. **A cor da bolha continua sendo a da marca.** A bolha de saída usava
   `--primary`, que deriva de `APP_ACCENT_HEX` — o white-label que o produto
   vende. Verde WhatsApp apagaria isso na superfície mais vista. O "cara de
   WhatsApp" vem da FORMA, não da cor.
2. **O fundo é padrão nosso, não o deles.** O quadriculado do WhatsApp é arte
   proprietária. O nosso é uma malha de pontos gerada em CSS.
3. **Só o Inbox.** Conexões, barra lateral e navegação ficam para depois.

## O que foi feito

| | |
|---|---|
| **Chão da conversa** | Tom próprio (`--chat-bg`) com malha de pontos por cima. Antes era o mesmo fundo do app |
| **Bolha** | Rabinho na primeira de cada bloco, cantos de 8px, largura máxima 65%, sombra de 1px, hora colada na última linha |
| **Agrupamento** | Falas seguidas do mesmo lado, com menos de 5 minutos entre elas, formam um bloco: só a primeira leva rabinho |
| **Lista** | Nome primeiro, avatar de 48px, divisor começando depois do avatar, metadado de CRM na faixa de detalhes |
| **Composer** | Pílula com os ícones DENTRO e botão de enviar circular fora |
| **Abas** | Deixaram de se sobrepor — a grade de colunas iguais virou flex com rolagem |

## Decisões de implementação que não são óbvias

**Os tokens moram nos três blocos de tema originais**, não num bloco novo com
seletor em lista. A forma óbvia — `:root, [data-theme="light"] { … }` — quebra
`extrairRegua` em `lib/branding/contraste.ts`, que acha o bloco claro por
igualdade exata de seletor. `tests/unit/branding-tema-claro-escopavel.test.ts`
existe para quem tentar simplificar esbarrar ali, e foi o que aconteceu.

**No tema escuro a bolha de saída escurece**, via `color-mix` com o chão da
conversa. Preserva o matiz de qualquer marca e resolve o problema de a cor de
botão virar parede acesa quando aplicada a metade da tela.

**"Falhou" não é vermelho na bolha de saída.** O fundo ali é a cor da marca,
trocada em runtime — não existe vermelho com contraste contra todas. Dentro da
bolha quem carrega o alarme é o ícone e o peso da fonte; a cor herda o texto da
bolha, que por construção já contrasta com ela.

## O que NÃO mudou, de propósito

Nenhum `data-testid` e nenhum texto visível. As seis specs E2E do Inbox passam
sem alteração, e nenhum teste do repo compara pixel — foi o que tornou este
trabalho barato de verificar.

## Verificação

- `pnpm typecheck` · `pnpm lint` 0 erros
- `pnpm test:unit` — 661 arquivos / 7.189 testes, verde
- As 6 specs E2E do Inbox — 10 casos, verdes
- Capturas em [`evidence/inbox-cara-de-whatsapp/`](../../../evidence/inbox-cara-de-whatsapp/README.md)
