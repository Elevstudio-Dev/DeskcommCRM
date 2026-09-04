import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A ÂNCORA da marca com que uma instalação NASCE.
 *
 * ── Duas marcas, e a diferença não é detalhe ──────────────────────────────
 *
 * `DEFAULT_APP_NAME` (`lib/branding.ts`) é o padrão do PRODUTO e não se edita —
 * `tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts` conta a história
 * inteira: um contribuidor trocou aquela constante para marcar a instalação do
 * cliente dele, e a personalização viajou num PR para todo mundo, sem conflito
 * e com a suíte verde.
 *
 * O argumento vale EM DOBRO para este fork. A política aqui é puxar do upstream
 * todo mês (`docs/elev/sincronizar-com-upstream.md`), e `lib/branding.ts` é
 * exatamente o arquivo que um merge reescreve limpo: a marca sumiria numa
 * sincronização, em silêncio, e o sintoma apareceria semanas depois na tela de
 * um cliente.
 *
 * `MARCA_PADRAO` (`hostgator-setup-kit/_common.sh`) é outra coisa: é o Enter da
 * pergunta que o instalador faz. Ele escreve `APP_NAME` no `.env`, que semeia
 * `platform_branding` na primeira leitura — a marca acaba no BANCO, que é o
 * caminho suportado do `docs/white-label.md` e sobrevive à troca de imagem.
 *
 * ── O modo de falhar que este arquivo pega ────────────────────────────────
 *
 * `$MARCA_PADRAO` só vale depois do `source "$KIT_DIR/_common.sh"`. Antes dele,
 * a variável expande para VAZIO — e o instalador não morre: ele oferece um
 * padrão em branco e grava `APP_NAME=` no `.env`. `resolveBranding` trata vazio
 * como "não configurou" e cai no padrão do produto. O cliente termina a
 * instalação vendo a marca do upstream, sem erro nenhum no caminho.
 *
 * Por isso o caso de ORDEM existe, e não é cerimônia: reordenar o script é
 * comum, e é a única mudança que quebra isto sem quebrar mais nada.
 */

const RAIZ = process.cwd();
const COMUM = fs.readFileSync(path.join(RAIZ, "hostgator-setup-kit/_common.sh"), "utf8");
const INSTALL = fs.readFileSync(path.join(RAIZ, "hostgator-setup-kit/install.sh"), "utf8");

/**
 * O nome escrito por extenso e UMA vez, aqui e em `_common.sh`. Comparar a
 * constante com ela mesma passaria sempre; o valor deste arquivo é ser a
 * segunda declaração independente.
 */
const MARCA = "Elev CRM";

function marcaPadraoDoComum(): string | null {
  const m = COMUM.match(/^MARCA_PADRAO="([^"]*)"$/m);
  return m ? m[1]! : null;
}

describe("a marca com que a instalação nasce", () => {
  it("está declarada uma vez, em _common.sh", () => {
    expect(
      marcaPadraoDoComum(),
      "MARCA_PADRAO sumiu ou mudou de forma em hostgator-setup-kit/_common.sh",
    ).toBe(MARCA);
  });

  it("o install.sh DERIVA dela — não repete o nome", () => {
    // A pergunta da entrevista e o nome do projeto Supabase são os dois lugares
    // que precisam do padrão. Ambos por variável: nome repetido à mão vira nome
    // divergente na primeira troca, e aí metade da instalação tem uma marca e
    // metade tem outra — split-brain que ninguém percebe, porque cada metade
    // parece certa sozinha.
    expect(INSTALL).toContain('"${APP_NAME:-$MARCA_PADRAO}"');
    expect(INSTALL).toContain("|$MARCA_PADRAO|||");
    expect(
      INSTALL.includes(MARCA),
      `install.sh escreveu "${MARCA}" à mão — deriva de $MARCA_PADRAO`,
    ).toBe(false);
  });

  it("carrega _common.sh ANTES de usar a variável — senão o padrão é vazio", () => {
    const linhas = INSTALL.split("\n");
    const carrega = linhas.findIndex((l) => /^\s*source\s+"\$KIT_DIR\/_common\.sh"/.test(l));
    const primeiroUso = linhas.findIndex((l) => l.includes("$MARCA_PADRAO"));

    expect(carrega, "install.sh não carrega mais o _common.sh").toBeGreaterThan(-1);
    expect(primeiroUso, "install.sh não usa mais MARCA_PADRAO").toBeGreaterThan(-1);
    expect(
      carrega,
      `o source do _common.sh (linha ${carrega + 1}) precisa vir ANTES do primeiro ` +
        `uso de $MARCA_PADRAO (linha ${primeiroUso + 1}). Fora de ordem a variável ` +
        `expande vazio, o .env nasce com APP_NAME= e a instalação mostra a marca ` +
        `do upstream — sem erro nenhum no caminho.`,
    ).toBeLessThan(primeiroUso);
  });

  it("não deixa DeskcommCRM voltar como padrão de APP_NAME", () => {
    // A catraca. O valor antigo era literal em dois pontos; se um `git merge` do
    // upstream trouxer qualquer um de volta, isto fica vermelho aqui em vez de
    // aparecer no `.env` de um cliente.
    for (const [arquivo, conteudo] of [
      ["_common.sh", COMUM],
      ["install.sh", INSTALL],
    ] as const) {
      expect(
        /APP_NAME[^\n]*DeskcommCRM|DeskcommCRM[^\n]*APP_NAME/.test(conteudo),
        `${arquivo} voltou a usar DeskcommCRM como padrão de APP_NAME`,
      ).toBe(false);
    }
  });
});
