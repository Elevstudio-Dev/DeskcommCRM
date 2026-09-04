import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AVISO QUE NASCE FORA DE UMA TELA TAMBÉM PRECISA DE `t()`.
 *
 * ─── O buraco, medido ──────────────────────────────────────────────────────
 *
 * `tests/unit/i18n-espanhol-cobre-a-tela` varre o AST das TELAS. Um `toast`
 * disparado de dentro de um hook não é uma tela — e passava por baixo dele.
 *
 * Medidos em 2026-09-04: onze avisos em `hooks/` e `components/` chamando
 * `toast.success("...")` com português cru. Quatro deles JÁ TINHAM tradução
 * escrita no dicionário, parada, sem uso — `"Rascunho salvo."`,
 * `"Gatilho atualizado."`, `"Política de handoff atualizada."`,
 * `"Lead atualizado"`. Alguém traduziu, e a chamada nunca passou por `t()`.
 * Tradução escrita e não ligada é o pior dos dois mundos: custou o trabalho e
 * não entrega nada.
 *
 * O efeito na tela: interface em espanhol, e o aviso da ação que a pessoa
 * acabou de fazer sai em português. Não quebra nada — o que é exatamente o
 * motivo de durar tanto tempo.
 *
 * ─── Por que por LINHA e não por AST ───────────────────────────────────────
 *
 * O guarda de tela já paga um analisador de AST porque precisa distinguir
 * prosa de identificador em JSX. Aqui a pergunta é bem menor: existe um
 * literal de string logo depois de `toast.<algo>(`? Uma varredura por linha
 * responde isso, e a diferença de custo é entre milissegundos e segundos.
 *
 * O QUE ELA NÃO PEGA, dito em voz alta: `toast.success(FRASE)` com a constante
 * declarada em outro lugar. Esse caso existe de propósito em
 * `lib/ai/credenciais/motivo-da-recusa.ts`, e quem o cobre é o próprio teste
 * daquele módulo, cruzando a lista de textos com o dicionário. As duas
 * abordagens se somam: esta pega o literal na chamada, aquela pega o literal
 * que viaja por variável.
 */

const RAIZ = process.cwd();
const PASTAS = ["hooks", "components", "lib", "app"];
const CHAMADA = /toast\.(?:success|error|info|warning|message)\(\s*"/;

function ehComentario(linha: string): boolean {
  const t = linha.trimStart();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

function arquivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const saida: string[] = [];
  for (const entrada of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === ".next") continue;
      saida.push(...arquivos(p));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.(test|spec)\.tsx?$/.test(entrada.name)) {
      saida.push(p);
    }
  }
  return saida;
}

function crus(): string[] {
  const achados: string[] = [];
  for (const rel of PASTAS.flatMap(arquivos)) {
    const linhas = fs.readFileSync(path.join(RAIZ, rel), "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (!ehComentario(linha) && CHAMADA.test(linha)) {
        achados.push(`${rel}:${i + 1}  ${linha.trim()}`);
      }
    });
  }
  return achados;
}

describe("avisos que nascem fora de uma tela", () => {
  it("a sonda enxerga os arquivos (guarda de vacuidade)", () => {
    // Varredura que não lê nada passaria sempre — e é o modo de falha desta
    // classe de teste.
    expect(PASTAS.flatMap(arquivos).length).toBeGreaterThan(300);
  });

  it("a sonda reconhece uma chamada crua quando vê uma", () => {
    // Controle positivo: sem isto, um regex quebrado passaria como "está tudo
    // traduzido".
    expect(CHAMADA.test('      toast.success("Salvo");')).toBe(true);
    expect(CHAMADA.test('      toast.success(t("Salvo"));')).toBe(false);
    expect(ehComentario(' * `toast.error("qualquer coisa")` — isto é prosa')).toBe(true);
  });

  it("nenhum toast dispara português cru — todos passam por t()", () => {
    const achados = crus();
    expect(
      achados,
      "Estes avisos saem em português mesmo com a interface em espanhol. " +
        "Envolva o texto em t() e acrescente a linha em lib/i18n/dicionario.ts " +
        "(confira antes se a tradução já não existe lá, parada):\n  " +
        achados.join("\n  "),
    ).toEqual([]);
  });
});
