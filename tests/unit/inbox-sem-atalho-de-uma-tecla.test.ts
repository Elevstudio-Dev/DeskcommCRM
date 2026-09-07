/**
 * O INBOX NÃO TEM ATALHO DE UMA TECLA — e isso é decisão, não esquecimento.
 *
 * ## O relato
 *
 * "quando eu aperto E, aparece para fechar a conversa, não quero isso"
 * (dono, 2026-09-05).
 *
 * O inbox tinha seis atalhos globais de uma letra: `j` `k` (navegar), `r`
 * (focar resposta), `a` (assumir), `e` (fechar) e `?` (ajuda).
 *
 * ## Por que a CLASSE, e não só o `e`
 *
 * Tirar só o `e` deixaria os outros cinco esperando. Atalho de uma letra SEM
 * modificador dispara em qualquer lugar da página que não seja campo de texto —
 * e no inbox a mão fica o tempo todo entre a lista e o composer. Clicar numa
 * conversa tira o foco do campo; a próxima tecla vira comando. `a` assume a
 * conversa de alguém, `r` rouba o foco no meio de outra coisa, e `e` abre uma
 * pergunta que ninguém fez.
 *
 * ## O que CONTINUA valendo, e por quê
 *
 * - `Enter` / `Shift+Enter` no composer: não são atalho, são o comportamento do
 *   campo de texto. Todo aplicativo de conversa faz isso, e a dica vive no
 *   `title` do próprio campo.
 * - `mod+k` (busca) e `mod+shift+l` (tema): exigem modificador, então não
 *   disparam sozinhos enquanto alguém trabalha. Se um dia incomodarem, é outra
 *   conversa — o defeito medido era o da tecla solta.
 *
 * ## O que este arquivo mede
 *
 * A ausência. Guarda de ausência tem um modo de falha próprio: passar por
 * vacuidade, medindo um arquivo que não existe mais por outro motivo. Por isso
 * o caso 1 é um controle POSITIVO — ele prova que o instrumento acha o arquivo
 * que ele varre.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const LAYOUT = join(RAIZ, "components", "inbox", "InboxLayout.tsx");

describe("o inbox não tem atalho de uma tecla", () => {
  it("o instrumento acha o arquivo que varre (controle positivo)", () => {
    // Sem isto, renomear `InboxLayout.tsx` faria todos os casos abaixo passarem
    // sobre uma string vazia — verde afirmando uma ausência que não mediu.
    expect(existsSync(LAYOUT), `${LAYOUT} sumiu — os casos abaixo virariam vácuo`).toBe(true);
    expect(readFileSync(LAYOUT, "utf8").length).toBeGreaterThan(1000);
  });

  it("os componentes de atalho não voltaram", () => {
    for (const f of ["InboxKeyboardShortcuts.tsx", "ShortcutsHelpDialog.tsx"]) {
      expect(
        existsSync(join(RAIZ, "components", "inbox", f)),
        `${f} voltou. Os atalhos de uma tecla foram removidos a pedido do dono — ` +
          `ver o comentário em InboxLayout.tsx. Se a decisão mudou, apague este caso ` +
          `junto, com o porquê escrito.`,
      ).toBe(false);
    }
  });

  it("nenhum atalho de uma letra é registrado no inbox", () => {
    // `useHotkeys("x", …)` com um caractere só e sem `+` é a assinatura do
    // defeito. `mod+k` e `mod+shift+l` têm `+` e passam — são de outros
    // componentes, e continuam valendo de propósito.
    const fonte = readFileSync(LAYOUT, "utf8");
    const umaLetra = [...fonte.matchAll(/useHotkeys\(\s*["'`]([^"'`+]{1,2})["'`]/g)].map(
      (m) => m[1],
    );
    expect(
      umaLetra,
      `atalho de uma tecla voltou ao inbox: ${umaLetra.join(", ")}`,
    ).toEqual([]);
  });

  it("o composer mantém Enter e Shift+Enter — não são atalho, são o campo", () => {
    // O contraponto do caso acima, e ele é necessário: um "conserto" que
    // arrancasse TODO tratamento de tecla do inbox levaria junto o envio da
    // mensagem, e o sintoma seria "não consigo mandar nada".
    const composer = readFileSync(join(RAIZ, "components", "inbox", "Composer.tsx"), "utf8");
    expect(composer).toContain('e.key === "Enter"');
    expect(composer).toContain("shiftKey");
  });
});
