/**
 * "FULANO ASSUMIU ESTA CONVERSA" — A LINHA QUE FALTAVA NA TELA.
 *
 * ## O defeito
 *
 * Duas pessoas com a mesma conversa aberta é o caso normal num time. Até aqui,
 * nada NA CONVERSA dizia que alguém tinha assumido:
 *
 *  - `conversation_assignment_events` guarda o fato desde sempre, escrita na
 *    MESMA transacao da troca de dono — e não tinha um único leitor de tela;
 *  - `lib/inbox/atividade-de-comando.ts` levou a informação para a linha do
 *    tempo do CRM, mas o cabeçalho dele declara o que aquilo NÃO conserta:
 *    `crm_lead_activities.lead_id` é `NOT NULL`, então conversa sem negócio
 *    aberto não tem onde pendurar a linha e a atividade não nasce.
 *
 * Conversa sem negócio é a maioria no começo de um atendimento. Ou seja: no
 * momento em que a colisão é mais provável, o aviso não existia em lugar nenhum.
 *
 * ## O que se mede aqui
 *
 * A função pura que decide O TEXTO. O componente e a rota têm seus próprios
 * caminhos; o que quebra calado é o mapa de `reason` -> frase, porque
 * `reason` vem de uma CONSTRAINT do banco
 * (`claim | transfer | release | routing | handoff`) e cresce sem avisar o TSX.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FONTE = readFileSync(
  join(process.cwd(), "components", "inbox", "EventoDeResponsavel.tsx"),
  "utf8",
);

/**
 * Os cinco valores que a constraint da tabela permite hoje. Escritos à mão de
 * propósito: é a cópia do CONTRATO DO BANCO, e o caso existe para reprovar
 * quando o banco ganhar um sexto e a tela não souber dele.
 */
const MOTIVOS = ["claim", "transfer", "release", "routing", "handoff"];

describe("o aviso de quem assumiu", () => {
  it("todo motivo que o banco permite tem tratamento na tela", () => {
    for (const motivo of MOTIVOS) {
      expect(
        FONTE.includes(`case "${motivo}":`),
        `\`reason='${motivo}'\` existe na constraint de conversation_assignment_events e não tem case aqui — ` +
          `o evento cairia no default e sumiria da conversa, calado`,
      ).toBe(true);
    }
  });

  it("motivo desconhecido SOME, em vez de virar texto generico", () => {
    // `default: return null` é a escolha certa e não um esquecimento: uma frase
    // como "conversa atualizada" ocupa espaço na linha do tempo sem informar
    // nada — ruído com aparência de informação. Sumir é honesto.
    const default_ = FONTE.slice(FONTE.indexOf("default:"));
    expect(
      default_.slice(0, 60).includes("return null"),
      "o default deixou de devolver null — motivo novo vai virar texto genérico na conversa",
    ).toBe(true);
  });

  it("sem o NOME, o fato ainda é dito — nunca uma linha vazia", () => {
    // Instalação sem service role não resolve nome (ver `nome-do-atendente.ts`,
    // que devolve mapa VAZIO de propósito). Se a tela dependesse do nome, o
    // aviso sumiria justamente onde ninguém configurou nada — e a pessoa
    // responderia por cima do colega sem saber.
    expect(FONTE).toContain("Alguém do time assumiu esta conversa");
  });

  it("o texto não é concatenado direto — passa por t()", () => {
    // Guarda barata contra a regressão mais comum deste arquivo: escrever a
    // frase inteira em português no meio do TSX. A guarda global de i18n só
    // enxerga `t("...")` literal.
    expect(FONTE).toContain('t("assumiu esta conversa")');
    expect(FONTE).toContain('t("liberou esta conversa")');
  });
});
