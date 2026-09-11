import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A CASCA TEM ALTURA DEFINIDA — senão todo `h-full` abaixo dela vira `auto`.
 *
 * ─── O defeito, visto por quem usa ──────────────────────────────────────────
 *
 * Abrir o construtor de follow-up e encontrar a paleta de nós à esquerda e um
 * vazio cinza à direita: o canvas (React Flow) existia no DOM com 0px de
 * altura. Cinco specs de E2E acusaram `.react-flow` "hidden" no mesmo dia.
 *
 * ─── A causa, e por que ela é estrutural ────────────────────────────────────
 *
 * `h-full` (height: 100%) só resolve contra um pai de altura DEFINIDA. Com o
 * menu lateral (`h-screen`, item de uma LINHA flex), a coluna de conteúdo era
 * esticada pela linha e ganhava altura definida por tabela — de graça, sem
 * ninguém ter decidido. Quando o menu saiu (2026-09-10) e a casca virou uma
 * coluna única com `min-h-screen`, a cadeia quebrou: `min-height` não é altura
 * definida, e cada `h-full` até o canvas resolveu como `auto`.
 *
 * Consertar o canvas consertaria UMA tela. A raiz com `h-dvh` conserta a
 * classe: toda tela que se apoia em `h-full` (o inbox, o construtor, a agenda)
 * volta a ter contra o que medir.
 *
 * ─── O que este teste NÃO prova ─────────────────────────────────────────────
 *
 * Ele lê CLASSES, não geometria. A prova de verdade é a E2E do construtor
 * (`followup-builder.spec.ts`, `.react-flow` visível). Esta é a rede barata:
 * impede a volta do padrão que causou o defeito.
 */

const CASCA = readFileSync("app/app/_components/AppShell.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("a casca do app tem altura definida", () => {
  it("a raiz é `h-dvh` — altura DEFINIDA, e não um mínimo", () => {
    expect(CASCA, "a raiz perdeu o h-dvh: todo h-full abaixo vira auto").toMatch(/\bh-dvh\b/);
    expect(CASCA, "min-h-screen na raiz é o que quebrou a cadeia").not.toMatch(/\bmin-h-screen\b/);
  });

  it("o <main> encolhe e rola por conta própria", () => {
    // Sem `min-h-0` um item de flex não fica menor que o conteúdo, e o `main`
    // empurraria a raiz para além da tela em vez de rolar por dentro.
    const main = CASCA.match(/<main[^>]*className="([^"]*)"/)?.[1] ?? "";
    expect(main).toMatch(/\bmin-h-0\b/);
    expect(main).toMatch(/\bflex-1\b/);
    expect(main).toMatch(/\boverflow-auto\b/);
  });
});
