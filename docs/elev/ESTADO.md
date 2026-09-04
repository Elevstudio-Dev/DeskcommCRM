# Estado do Elev CRM

> **Gerado por `pnpm elev:estado` em 2026-09-04.** Todo número aqui foi medido na
> execução — nenhum é copiado nem mantido à mão. Se esta data estiver velha,
> rode o comando de novo em vez de acreditar no que está escrito.

**Versão:** v1.12.1 · **Commit:** `81d5bcd1` · **Branch:** `elev/inbox-avatar-e-tempo`

## Tamanho

| Métrica | Valor |
|---|---|
| Arquivos TS/TSX (app+lib+components+workers) | 1536 |
| Rotas de API | 229 |
| Migrations | 189 |
| Documentos em `docs/` | 182 |

## Testes

| Camada | Arquivos |
|---|---|
| Unitários | 768 |
| Invariantes de banco | 145 |
| Ponta a ponta (E2E) | 74 |

Para o placar (quantos passam), rode: `pnpm test:unit`, `pnpm test:db`, `pnpm test:e2e`.
Este script não roda a suíte de propósito — medir tamanho é barato, rodar
teste não é, e um comando que demora 30 minutos ninguém executa.

## Higiene

| Sinal | Valor | Leitura |
|---|---|---|
| `console.log` fora do logger | 3 | Deve ficar perto de zero |
| `TODO`/`FIXME`/`HACK` | 96 | Trabalho reconhecido, não escondido |
| Rotas sem teste dedicado ao lado | 200 de 229 | Muitas são cobertas por E2E; é um sinal, não um veredito |

## Distância para o upstream

| | |
|---|---|
| Issues abertas em `melgarafael/DeskcommCRM` | 47 |
| Commits deles que ainda não trouxemos | 147 |

Quando `atrás` crescer, siga [sincronizar-com-upstream.md](sincronizar-com-upstream.md)
— a decisão de puxar não é automática.
