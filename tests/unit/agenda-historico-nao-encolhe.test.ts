import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O HISTÓRICO DA AGENDA NÃO É A VÁLVULA DE ESCAPE DA COLUNA.
 *
 * ─── O defeito, visto por quem usa ──────────────────────────────────────────
 *
 * Abrir a Agenda numa janela baixa e não ver o histórico: as quatro abas
 * (próximos, aguardando, passados, cancelados) existiam no DOM com 0px de
 * altura. No CI (1280x720, banco limpo) `agenda-tela-do-produto` reprovou;
 * localmente, em janela alta, passava — verde por janela grande.
 *
 * ─── A causa ────────────────────────────────────────────────────────────────
 *
 * Quando a casca ganhou altura definida (`casca-tem-altura-definida`), o
 * `h-full` da tela da Agenda passou a resolver de verdade e a coluna virou uma
 * caixa de altura fixa. Numa caixa flex, só encolhe abaixo do conteúdo quem tem
 * `min-h-0`. Os filhos com `min-h-0` eram dois: a grade (`flex-1`, base 0 — que
 * por isso não participa do encolhimento) e o histórico. Sobrou para o
 * histórico absorver o excesso inteiro.
 *
 * ─── O desenho que fica ─────────────────────────────────────────────────────
 *
 * - Raiz da tela: `min-h-full`, e NÃO `h-full`. Preenche a janela quando cabe
 *   e CRESCE quando não cabe — a página rola e a grade mostra o dia inteiro.
 *   Com `h-full` (caixa fixa) a grade vira uma janelinha de ~240px com rolagem
 *   própria, e arrastar um card por várias horas fica impossível: o card de
 *   origem sai da vista quando o destino entra (`agenda-grade-interativa`,
 *   "arrastar para fora da disponibilidade", reprovava 3 em 3).
 * - Histórico: `shrink-0` + teto (`max-h-[...]`) — mede o conteúdo e rola por
 *   dentro; nunca é quem cede, em caixa nenhuma.
 * - Grade: piso em px DENTRO de `AgendaInterativa` (a barra de tipos acima
 *   dela quebra linha e mede 134px com muitos tipos; um piso na raiz seria
 *   dividido com a barra). A raiz de `AgendaInterativa` não tem `min-h-0`.
 *
 * ─── O que este teste NÃO prova ─────────────────────────────────────────────
 *
 * Ele lê CLASSES, não geometria. A prova de verdade é a E2E
 * (`agenda-tela-do-produto.spec.ts`, histórico visível com as quatro abas).
 * Esta é a rede barata: impede a volta do padrão que causou o defeito.
 */

const semComentarios = (caminho: string) =>
  readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const TELA = semComentarios("app/app/agenda/_client.tsx");
const INTERATIVA = semComentarios("components/agenda/AgendaInterativa.tsx");

function classesDe(fonte: string, componente: string): string {
  const bloco = fonte.match(new RegExp(`<${componente}\\b[\\s\\S]*?/>`))?.[0] ?? "";
  return bloco.match(/className="([^"]*)"/)?.[1] ?? "";
}

describe("a tela da Agenda numa coluna de altura definida", () => {
  it("a raiz é `min-h-full` — preenche quando cabe, cresce quando não cabe", () => {
    const raiz = TELA.match(/data-testid="tela-agenda"[\s\S]*?className="([^"]*)"/)?.[1] ?? "";
    expect(raiz, "a raiz da Agenda sumiu ou perdeu a className").not.toBe("");
    expect(raiz, "min-h-full é o contrato: a página rola, a grade mostra o dia inteiro").toMatch(
      /\bmin-h-full\b/,
    );
    expect(raiz, "h-full vira caixa fixa: histórico a 0px e grade de 240px com rolagem própria").not.toMatch(
      /(^|\s)h-full(\s|$)/,
    );
  });

  it("o histórico é `shrink-0` — mede o conteúdo e rola por dentro, nunca some", () => {
    const classes = classesDe(TELA, "HistoricoDaAgenda");
    expect(classes, "o histórico voltou a ser quem encolhe até 0px").toMatch(/\bshrink-0\b/);
    expect(classes, "sem teto ele engoliria a grade").toMatch(/\bmax-h-\[/);
  });

  it("a grade é quem cede, mas com piso em px — dentro de AgendaInterativa", () => {
    const naTela = classesDe(TELA, "AgendaInterativa");
    expect(naTela).toMatch(/\bflex-1\b/);
    expect(naTela, "min-h-0 aqui deixaria o item sumir").not.toMatch(/\bmin-h-0\b/);

    const grade = classesDe(INTERATIVA, "GradeDaAgenda");
    expect(grade, "a grade precisa de um piso em px, não de min-h-0").toMatch(/\bmin-h-\[\d+px\]/);
    expect(grade).not.toMatch(/\bmin-h-0\b/);

    const raiz = INTERATIVA.match(/return \(\s*<div className=\{cn\("([^"]*)"/)?.[1] ?? "";
    expect(raiz, "a raiz de AgendaInterativa com min-h-0 encolhe abaixo do piso da grade").not.toMatch(
      /\bmin-h-0\b/,
    );
  });
});
