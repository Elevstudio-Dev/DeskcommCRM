#!/usr/bin/env bash
#
# elev:estado — remede o estado do Elev CRM e regrava docs/elev/ESTADO.md.
#
# ═══ POR QUE ESTE SCRIPT EXISTE ═══
#
# A documentação de estado do projeto original envelheceu em silêncio: medido
# em 2026-09-03, o `docs/current-state.md` dele dizia 169 rotas de API quando
# havia 228, e 987 arquivos quando havia 1.531 — defasagem de até 4× em cinco
# semanas. Nada avisou. Quem lesse aquele número tomaria decisão sobre um
# sistema que não existe mais.
#
# A saída não é "atualizar com mais disciplina". É não guardar número nenhum:
# este script REMEDE tudo a cada execução e regrava o documento. Um número
# aqui nunca envelhece porque nunca é escrito à mão.
#
# Uso:
#   pnpm elev:estado           # remede e regrava docs/elev/ESTADO.md
#   pnpm elev:estado --check   # só imprime, não escreve (para CI)
#
set -uo pipefail
cd "$(dirname "$0")/.."

SO_CHECAR=0
[ "${1:-}" = "--check" ] && SO_CHECAR=1

UPSTREAM_REPO="${UPSTREAM_REPO:-melgarafael/DeskcommCRM}"
HOJE="$(date +%Y-%m-%d)"

# ── medições do código ──────────────────────────────────────────────────────
n_ts=$(find app lib components workers -name '*.ts' -o -name '*.tsx' 2>/dev/null | wc -l)
n_rotas=$(find app/api -name 'route.ts' 2>/dev/null | wc -l)
n_migr=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l)
n_unit=$(find . -path ./node_modules -prune -o -name '*.test.ts' -print -o -name '*.test.tsx' -print 2>/dev/null | grep -vc node_modules)
n_inv=$(ls tests/invariants/*.test.ts 2>/dev/null | wc -l)
n_e2e=$(ls tests/e2e/*.spec.ts 2>/dev/null | wc -l)
n_docs=$(find docs -name '*.md' 2>/dev/null | wc -l)
n_console=$(grep -rln 'console\.log' app lib components workers --include=*.ts --include=*.tsx 2>/dev/null | grep -v 'lib/logger.ts' | wc -l)
n_todo=$(grep -rnE 'TODO|FIXME|HACK' app lib components workers --include=*.ts --include=*.tsx 2>/dev/null | grep -vc '\.test\.')

# rotas sem teste ao lado — o sinal mais direto de onde a cobertura é fina
sem_teste=0
for f in $(find app/api -name 'route.ts' 2>/dev/null); do
  [ -f "${f%.ts}.test.ts" ] || sem_teste=$((sem_teste + 1))
done

# ── distância para o upstream ───────────────────────────────────────────────
# Falha ABERTA: sem rede ou sem `gh`, o campo vira "não medido" e o resto do
# documento sai igual. Um relatório que não sai porque o GitHub caiu é pior
# que um com uma linha faltando.
issues="não medido"
atras="não medido"
if command -v gh >/dev/null 2>&1; then
  issues=$(gh api "repos/$UPSTREAM_REPO/issues" --paginate \
    -q '.[] | select(.pull_request==null) | .number' 2>/dev/null | wc -l) || issues="não medido"
  [ "$issues" = "0" ] && issues="não medido"
fi
if git remote | grep -q '^origin$'; then
  git fetch -q origin main 2>/dev/null && \
    atras=$(git rev-list --count HEAD..origin/main 2>/dev/null) || atras="não medido"
fi

versao=$(git describe --tags --abbrev=0 2>/dev/null || echo "sem tag")
commit=$(git rev-parse --short HEAD)
branch=$(git branch --show-current)

# ── o documento ─────────────────────────────────────────────────────────────
gerar() {
cat <<EOF
# Estado do Elev CRM

> **Gerado por \`pnpm elev:estado\` em $HOJE.** Todo número aqui foi medido na
> execução — nenhum é copiado nem mantido à mão. Se esta data estiver velha,
> rode o comando de novo em vez de acreditar no que está escrito.

**Versão:** $versao · **Commit:** \`$commit\` · **Branch:** \`$branch\`

## Tamanho

| Métrica | Valor |
|---|---|
| Arquivos TS/TSX (app+lib+components+workers) | $n_ts |
| Rotas de API | $n_rotas |
| Migrations | $n_migr |
| Documentos em \`docs/\` | $n_docs |

## Testes

| Camada | Arquivos |
|---|---|
| Unitários | $n_unit |
| Invariantes de banco | $n_inv |
| Ponta a ponta (E2E) | $n_e2e |

Para o placar (quantos passam), rode: \`pnpm test:unit\`, \`pnpm test:db\`, \`pnpm test:e2e\`.
Este script não roda a suíte de propósito — medir tamanho é barato, rodar
teste não é, e um comando que demora 30 minutos ninguém executa.

## Higiene

| Sinal | Valor | Leitura |
|---|---|---|
| \`console.log\` fora do logger | $n_console | Deve ficar perto de zero |
| \`TODO\`/\`FIXME\`/\`HACK\` | $n_todo | Trabalho reconhecido, não escondido |
| Rotas sem teste dedicado ao lado | $sem_teste de $n_rotas | Muitas são cobertas por E2E; é um sinal, não um veredito |

## Distância para o upstream

| | |
|---|---|
| Issues abertas em \`$UPSTREAM_REPO\` | $issues |
| Commits deles que ainda não trouxemos | $atras |

Quando \`atrás\` crescer, siga [sincronizar-com-upstream.md](sincronizar-com-upstream.md)
— a decisão de puxar não é automática.
EOF
}

if [ "$SO_CHECAR" = "1" ]; then
  gerar
  exit 0
fi

mkdir -p docs/elev
gerar > docs/elev/ESTADO.md
echo "✓ docs/elev/ESTADO.md regravado ($HOJE)"
echo "  $n_ts arquivos · $n_rotas rotas · $n_migr migrations · $n_e2e specs E2E"
echo "  upstream: $issues issues abertas · $atras commits à frente"
