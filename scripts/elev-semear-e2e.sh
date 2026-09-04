#!/usr/bin/env bash
# Semeia o banco local com O MESMO conjunto que o CI semeia antes do E2E.
#
# POR QUE ISTO EXISTE. Rodar `pnpm exec playwright test` local sem estes seeds
# nao da "quase o resultado do CI": da um resultado DIFERENTE, com falhas que
# nao sao defeito nenhum. Medido em 2026-09-03: as duas specs de
# `central-de-avisos-capacidades` falhavam local e passavam no CI, e a diferenca
# inteira era `seed-e2e-capacidades-ausentes` — que o CI roda e a maquina de
# desenvolvimento nao. Duas falhas fantasma custam mais caro que parecem: elas
# ensinam a ignorar vermelho.
#
# A ARMADILHA DO ARQUIVO DE ENV. O CI escreve `.env.local` com o conjunto
# completo, entao o workflow chama `--env-file=.env.local`. Na maquina de
# desenvolvimento quem tem o conjunto completo e `.env.e2e`, e `.env.local`
# guarda outra coisa (a marca). Copiar a linha do CI ao pe da letra falha com
# "NEXT_PUBLIC_SUPABASE_URL: expected string, received undefined" — erro que
# aponta para o Supabase e nao para o env, que e o que realmente faltou.
# Este script escolhe o arquivo que EXISTE, em vez de supor qual e.
#
# Fonte: .github/workflows/e2e.yml (linhas dos `seed-e2e-*`). Se o CI ganhar um
# seed novo, ele entra aqui — senao a diferenca volta a aparecer como defeito.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=""
for candidato in .env.e2e .env.local; do
  if [ -f "$candidato" ] && grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$candidato"; then
    ENV_FILE="$candidato"; break
  fi
done
if [ -z "$ENV_FILE" ]; then
  echo "erro: nenhum arquivo de env com SUPABASE_SERVICE_ROLE_KEY (.env.e2e ou .env.local)." >&2
  echo "      gere um com: pnpm e2e:env" >&2
  exit 1
fi
echo "[elev-semear] usando $ENV_FILE"

set -a; . "./$ENV_FILE"; set +a

for seed in \
  seed-e2e-credentials \
  seed-e2e-escalacao \
  seed-e2e-capacidades-ausentes \
  seed-e2e-followup-agent \
  seed-e2e-catalogo-openrouter
do
  printf '[elev-semear] %s ... ' "$seed"
  if saida=$(pnpm exec tsx --env-file="$ENV_FILE" "scripts/$seed.ts" 2>&1); then
    echo "ok"
  else
    echo "FALHOU"; echo "$saida" | tail -20; exit 1
  fi
done
echo "[elev-semear] pronto — o banco local espelha o do CI."
