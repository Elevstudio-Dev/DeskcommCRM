# Estado do Elev CRM

> **Gerado por `pnpm elev:estado` em 2026-09-11.** Todo número aqui foi medido na
> execução — nenhum é copiado nem mantido à mão. Se esta data estiver velha,
> rode o comando de novo em vez de acreditar no que está escrito.

**Versão:** v1.14.0 · **Commit:** `47e386e1` · **Branch:** `main`

## Tamanho

| Métrica | Valor |
|---|---|
| Arquivos TS/TSX (app+lib+components+workers) | 1595 |
| Rotas de API | 242 |
| Migrations | 196 |
| Documentos em `docs/` | 186 |

## Testes

| Camada | Arquivos |
|---|---|
| Unitários | 819 |
| Invariantes de banco | 151 |
| Ponta a ponta (E2E) | 78 |

Para o placar (quantos passam), rode: `pnpm test:unit`, `pnpm test:db`, `pnpm test:e2e`.
Este script não roda a suíte de propósito — medir tamanho é barato, rodar
teste não é, e um comando que demora 30 minutos ninguém executa.

## Higiene

| Sinal | Valor | Leitura |
|---|---|---|
| `console.log` fora do logger | 3 | Deve ficar perto de zero |
| `TODO`/`FIXME`/`HACK` | 106 | Trabalho reconhecido, não escondido |
| Rotas sem teste dedicado ao lado | 213 de 242 | Muitas são cobertas por E2E; é um sinal, não um veredito |

## Distância para o upstream

| | |
|---|---|
| Issues abertas em `melgarafael/DeskcommCRM` | 74 |
| Commits deles que ainda não trouxemos | 404 |

Quando `atrás` crescer, siga [sincronizar-com-upstream.md](sincronizar-com-upstream.md)
— a decisão de puxar não é automática.
